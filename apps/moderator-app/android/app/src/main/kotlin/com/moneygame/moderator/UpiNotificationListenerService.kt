package com.moneygame.moderator

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.BatteryManager
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

class UpiNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "UpiListenerService"
        const val PREFS_NAME = "moneygame_moderator_listener_prefs"
        const val KEY_BASE_URL = "base_url"
        const val KEY_WEBHOOK_SECRET = "webhook_secret"
        const val KEY_LAST_HEARTBEAT = "last_heartbeat_time"
        const val KEY_LAST_NOTIF_AMOUNT = "last_notification_amount"
        const val KEY_LAST_NOTIF_UTR = "last_notification_utr"
        const val KEY_LAST_NOTIF_TIME = "last_notification_time"
        const val KEY_LAST_NOTIF_PKG = "last_notification_package"
        const val KEY_LAST_NOTIF_TEXT = "last_notification_text"
        const val KEY_IS_CONNECTED = "is_listener_connected"

        const val DEFAULT_BASE_URL = ""
        const val DEFAULT_WEBHOOK_SECRET = ""

        const val NOTIFICATION_CHANNEL_ID = "moneygame_listener_alerts"

        // Deduplication cache to prevent re-processing duplicate notifications within 60s
        val outboxLock = Any()
        private val outboxSending = java.util.concurrent.atomic.AtomicBoolean(false)
        private val recentPayments = ConcurrentHashMap<String, Long>()
    }

    private val networkExecutor = Executors.newCachedThreadPool()
    private var scheduler: ScheduledExecutorService? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "MoneyGame UPI Listener connected to notification stream.")
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_IS_CONNECTED, true).apply()

        startHeartbeatScheduler()
        retryOutbox()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "MoneyGame UPI Listener disconnected from notification stream.")
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putBoolean(KEY_IS_CONNECTED, false).apply()

        networkExecutor.execute { sendHeartbeat() }
        stopHeartbeatScheduler()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopHeartbeatScheduler()
        networkExecutor.shutdown()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return
        if (getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_WEBHOOK_SECRET, "").isNullOrBlank()) return

        val pkg = sbn.packageName ?: return
        // Ignore internal MoneyGame notifications to prevent feedback loops
        if (pkg == packageName || pkg == "com.moneygame.user" || pkg == "com.moneygame.app") return

        val notif = sbn.notification ?: return
        val extras = notif.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

        val fullText = "$title $text $bigText $subText".trim()
        if (fullText.isEmpty()) return

        // Check if notification indicates an incoming payment / credit
        if (isPotentialUpiCredit(pkg, fullText)) {
            val amount = extractAmount(fullText)
            if (amount != null && amount > 0) {
                val utr = extractUtr(fullText)
                val dedupKey = "${amount}_${utr ?: fullText.hashCode()}"
                val now = System.currentTimeMillis()

                // Prevent processing the exact same payment within 45 seconds
                val lastSeen = recentPayments[dedupKey]
                if (lastSeen != null && (now - lastSeen) < 45_000) {
                    Log.d(TAG, "Skipping duplicate payment notification: $dedupKey")
                    return
                }
                recentPayments[dedupKey] = now

                // Prune old entries
                if (recentPayments.size > 200) {
                    val cutoff = now - 60_000
                    recentPayments.entries.removeIf { it.value < cutoff }
                }

                Log.i(TAG, "Detected incoming payment: ₹$amount | UTR: $utr | App: $pkg")
                saveLastNotification(amount, utr, pkg, fullText)
                postLocalAlert(amount, utr, title)
                if (!utr.isNullOrEmpty()) {
                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val payload = JSONObject().apply {
                        put("amount", amount); put("utr", utr); put("senderName", title)
                        put("detectedApp", pkg); put("rawNotification", fullText.take(200))
                        put("accountId", prefs.getString("account_id", ""))
                    }
                    synchronized(outboxLock) {
                        val queue = JSONObject(prefs.getString("payment_outbox", "{}") ?: "{}")
                        queue.put(utr, payload)
                        prefs.edit().putString("payment_outbox", queue.toString()).commit()
                    }
                    retryOutbox()
                }
            }
        }
    }

    private fun isPotentialUpiCredit(pkg: String, text: String): Boolean {
        val lower = text.lowercase()

        // Explicit debit / paid out check
        val isDebit = (lower.contains("debited") || lower.contains("sent rs") ||
                lower.contains("paid rs") || lower.contains("paid to") ||
                lower.contains("transferred to") || lower.contains("spent")) &&
                !lower.contains("credited") && !lower.contains("received")

        if (isDebit) return false

        // Known UPI apps & banking apps
        val isKnownApp = pkg in setOf(
            "com.phonepe.app", "com.google.android.apps.nbu.paisa.user", "net.one97.paytm",
            "in.org.npci.upiapp", "com.dreamplug.androidapp", "com.sbi.lotusintouch",
            "com.snapwork.hdfc", "com.csam.icici.bank.imobile", "com.axis.mobile"
        )
        val isSmsApp = pkg in setOf("com.google.android.apps.messaging", "com.android.mms", "com.samsung.android.messaging")

        val hasCreditKeywords = lower.contains("credited") ||
                lower.contains("received") ||
                lower.contains("credit of") ||
                lower.contains("deposited") ||
                lower.contains("added to your") ||
                lower.contains("payment of")

        if (isKnownApp) {
            return hasCreditKeywords
        }

        if (isSmsApp) {
            val hasBankSender = lower.contains("bank") || lower.contains("upi") ||
                    lower.contains("sbi") || lower.contains("hdfc") || lower.contains("icici") ||
                    lower.contains("axis") || lower.contains("paisa") || lower.contains("paytm")
            return hasBankSender && hasCreditKeywords
        }

        return false
    }

    private fun extractAmount(text: String): Double? {
        val clean = text.replace(",", "")
        // Matches ₹100, Rs. 100, INR 100.00, credited by Rs 100
        val patterns = listOf(
            Pattern.compile("(?:rs\\.?|inr|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("credited\\s*(?:by|with)?\\s*(?:rs\\.?|inr|₹)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("received\\s*(?:rs\\.?|inr|₹)?\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([0-9]+(?:\\.[0-9]{1,2})?)\\s*(?:rs\\.?|inr|₹)", Pattern.CASE_INSENSITIVE)
        )

        for (pattern in patterns) {
            val matcher = pattern.matcher(clean)
            if (matcher.find()) {
                val strAmt = matcher.group(1)
                try {
                    val parsed = strAmt?.toDoubleOrNull()
                    if (parsed != null && parsed > 0) return parsed
                } catch (_: Exception) {}
            }
        }
        return null
    }

    private fun extractUtr(text: String): String? {
        // Matches 12-digit UPI reference / RRN / UTR
        val patterns = listOf(
            Pattern.compile("(?:upi\\s*ref(?:\\s*no)?|ref\\s*no|rrn|utr|txn\\s*id|transaction\\s*id|upi\\/)[:\\s/]*([0-9]{12})", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b([0-9]{12})\\b")
        )

        for (pattern in patterns) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                val found = matcher.group(1)
                if (found != null && found.length == 12) {
                    return found
                }
            }
        }
        return null
    }

    private fun saveLastNotification(amount: Double, utr: String?, pkg: String, fullText: String) {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putFloat(KEY_LAST_NOTIF_AMOUNT, amount.toFloat())
            .putString(KEY_LAST_NOTIF_UTR, utr ?: "")
            .putLong(KEY_LAST_NOTIF_TIME, System.currentTimeMillis())
            .putString(KEY_LAST_NOTIF_PKG, pkg)
            .putString(KEY_LAST_NOTIF_TEXT, fullText.take(120))
            .apply()
    }

    private fun retryOutbox() {
        if (!outboxSending.compareAndSet(false, true)) return
        networkExecutor.execute {
            try {
                val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val base = prefs.getString(KEY_BASE_URL, "")?.trimEnd('/') ?: ""
                val secret = prefs.getString(KEY_WEBHOOK_SECRET, "") ?: ""
                val accountId = prefs.getString("account_id", "") ?: ""
                if (base.isBlank() || secret.isBlank() || accountId.isBlank()) return@execute
                val snapshot = synchronized(outboxLock) {
                    JSONObject(prefs.getString("payment_outbox", "{}") ?: "{}")
                }
                for (key in snapshot.keys().asSequence().toList()) {
                    val payload = snapshot.getJSONObject(key)
                    if (payload.optString("accountId") != accountId) continue
                    if (prefs.getString(KEY_WEBHOOK_SECRET, "") != secret) break
                    var conn: HttpURLConnection? = null
                    try {
                        // Never hold the outbox lock during network I/O: notification callbacks must not block.
                        conn = URL("$base/api/webhooks/upi-notify").openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"; conn.connectTimeout = 10000; conn.readTimeout = 10000; conn.doOutput = true
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.setRequestProperty("x-webhook-secret", secret)
                        OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
                        if (conn.responseCode in 200..299) {
                            synchronized(outboxLock) {
                                if (prefs.getString(KEY_WEBHOOK_SECRET, "") == secret) {
                                    val latest = JSONObject(prefs.getString("payment_outbox", "{}") ?: "{}")
                                    latest.remove(key)
                                    prefs.edit().putString("payment_outbox", latest.toString()).commit()
                                }
                            }
                        } else if (conn.responseCode == 401 || conn.responseCode == 403) break
                    } catch (e: Exception) { Log.w(TAG, "Report retained for retry: ${e.message}") }
                    finally { conn?.disconnect() }
                }
            } finally { outboxSending.set(false) }
        }
    }

    private fun startHeartbeatScheduler() {
        stopHeartbeatScheduler()
        scheduler = Executors.newSingleThreadScheduledExecutor()
        scheduler?.scheduleWithFixedDelay({
            sendHeartbeat()
            retryOutbox()
        }, 2, 60, TimeUnit.SECONDS)
    }

    private fun stopHeartbeatScheduler() {
        try {
            scheduler?.shutdownNow()
            scheduler = null
        } catch (_: Exception) {}
    }

    fun sendHeartbeat() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val baseUrl = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL)?.trimEnd('/') ?: DEFAULT_BASE_URL
            val secret = prefs.getString(KEY_WEBHOOK_SECRET, DEFAULT_WEBHOOK_SECRET) ?: DEFAULT_WEBHOOK_SECRET
            if (baseUrl.isBlank() || secret.isBlank()) {
                return
            }
            var safeUrl = baseUrl
            if (safeUrl.startsWith("http://") && !safeUrl.contains("10.0.2.2") && !safeUrl.contains("localhost") && !safeUrl.contains("127.0.0.1")) {
                safeUrl = safeUrl.replaceFirst("http://", "https://")
            }

            val batteryManager = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            val batteryLevel = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
            val phoneModel = "${Build.MANUFACTURER} ${Build.MODEL}"

            val endpoint = "$safeUrl/api/webhooks/listener-heartbeat"
            val url = URL(endpoint)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json; utf-8")
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("x-webhook-secret", secret)

            val payload = JSONObject().apply {
                put("batteryLevel", if (batteryLevel >= 0) batteryLevel else 100)
                put("phoneModel", phoneModel)
                put("listenerConnected", prefs.getBoolean(KEY_IS_CONNECTED, false))
            }

            OutputStreamWriter(conn.outputStream).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }

            val code = conn.responseCode
            if (code in 200..299) {
                prefs.edit().putLong(KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply()
                Log.d(TAG, "Heartbeat acknowledged by server ($code)")
            } else {
                Log.w(TAG, "Heartbeat response: $code")
            }
            conn.disconnect()
        } catch (e: Exception) {
            Log.w(TAG, "Heartbeat error: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Payment Alerts"
            val desc = "Alerts when incoming bank & UPI payments are captured"
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(NOTIFICATION_CHANNEL_ID, name, importance).apply {
                description = desc
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.createNotificationChannel(channel)
        }
    }

    private fun postLocalAlert(amount: Double, utr: String?, sender: String) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val utrLabel = if (!utr.isNullOrEmpty()) "UTR: $utr" else "Auto-matching..."
            val senderLabel = if (sender.isNotEmpty()) "from $sender" else ""

            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
            }

            builder.setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle("MoneyGame Moderator: Captured ₹$amount")
                .setContentText("$utrLabel $senderLabel".trim())
                .setAutoCancel(true)

            nm.notify((System.currentTimeMillis() % 100000).toInt(), builder.build())
        } catch (e: Exception) {
            Log.w(TAG, "Failed to post local alert: ${e.message}")
        }
    }
}
