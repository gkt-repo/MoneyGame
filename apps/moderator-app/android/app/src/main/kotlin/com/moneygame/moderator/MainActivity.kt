package com.moneygame.moderator

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Display
import androidx.core.app.NotificationManagerCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.moneygame.moderator/listener"
    private val bgExecutor = Executors.newCachedThreadPool()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        force120Hz()
    }

    override fun onResume() {
        super.onResume()
        force120Hz()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        force120Hz()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            val prefs = getSharedPreferences(UpiNotificationListenerService.PREFS_NAME, Context.MODE_PRIVATE)

            when (call.method) {
                "isPermissionGranted" -> {
                    val isGranted = NotificationManagerCompat.getEnabledListenerPackages(this)
                        .contains(packageName)
                    result.success(isGranted)
                }

                "openPermissionSettings" -> {
                    try {
                        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("ERROR", "Cannot open notification listener settings: ${e.message}", null)
                    }
                }

                "isBatteryOptimizationIgnored" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                        val isIgnoring = pm?.isIgnoringBatteryOptimizations(packageName) ?: true
                        result.success(isIgnoring)
                    } else {
                        result.success(true)
                    }
                }

                "requestIgnoreBatteryOptimization" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        try {
                            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:$packageName")
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            startActivity(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("ERROR", "Cannot request battery optimization bypass: ${e.message}", null)
                        }
                    } else {
                        result.success(true)
                    }
                }

                "clearConfig" -> {
                    synchronized(UpiNotificationListenerService.outboxLock) {
                        prefs.edit().remove(UpiNotificationListenerService.KEY_WEBHOOK_SECRET)
                            .remove("account_id").remove("payment_outbox").commit()
                    }
                    result.success(true)
                }
                "saveConfig" -> {
                    val baseUrl = call.argument<String>("baseUrl")
                    val webhookSecret = call.argument<String>("webhookSecret")

                    val editor = prefs.edit()
                    val accountId = call.argument<String>("accountId")
                    if (accountId != null) editor.putString("account_id", accountId)
                    if (!baseUrl.isNullOrBlank()) {
                        editor.putString(UpiNotificationListenerService.KEY_BASE_URL, baseUrl.trim())
                    }
                    if (!webhookSecret.isNullOrBlank()) {
                        editor.putString(UpiNotificationListenerService.KEY_WEBHOOK_SECRET, webhookSecret.trim())
                    }
                    editor.apply()
                    result.success(true)
                }

                "getConfig" -> {
                    val baseUrl = prefs.getString(
                        UpiNotificationListenerService.KEY_BASE_URL,
                        UpiNotificationListenerService.DEFAULT_BASE_URL
                    )
                    val secret = prefs.getString(
                        UpiNotificationListenerService.KEY_WEBHOOK_SECRET,
                        UpiNotificationListenerService.DEFAULT_WEBHOOK_SECRET
                    )
                    result.success(mapOf(
                        "baseUrl" to baseUrl,
                        "webhookSecret" to secret
                    ))
                }

                "getListenerStatus" -> {
                    val isGranted = NotificationManagerCompat.getEnabledListenerPackages(this)
                        .contains(packageName)

                    val isBatteryIgnored = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
                        pm?.isIgnoringBatteryOptimizations(packageName) ?: true
                    } else {
                        true
                    }

                    val isConnected = prefs.getBoolean(UpiNotificationListenerService.KEY_IS_CONNECTED, false)
                    val lastHeartbeat = prefs.getLong(UpiNotificationListenerService.KEY_LAST_HEARTBEAT, 0L)
                    val lastAmount = prefs.getFloat(UpiNotificationListenerService.KEY_LAST_NOTIF_AMOUNT, 0f).toDouble()
                    val lastUtr = prefs.getString(UpiNotificationListenerService.KEY_LAST_NOTIF_UTR, "") ?: ""
                    val lastTime = prefs.getLong(UpiNotificationListenerService.KEY_LAST_NOTIF_TIME, 0L)
                    val lastPkg = prefs.getString(UpiNotificationListenerService.KEY_LAST_NOTIF_PKG, "") ?: ""
                    val lastText = prefs.getString(UpiNotificationListenerService.KEY_LAST_NOTIF_TEXT, "") ?: ""

                    result.success(mapOf(
                        "queuedPayments" to org.json.JSONObject(prefs.getString("payment_outbox", "{}") ?: "{}").length(),
                        "isPermissionGranted" to isGranted,
                        "isBatteryOptimizationIgnored" to isBatteryIgnored,
                        "isListenerConnected" to isConnected,
                        "lastHeartbeatAt" to lastHeartbeat,
                        "lastNotificationAmount" to lastAmount,
                        "lastNotificationUtr" to lastUtr,
                        "lastNotificationTime" to lastTime,
                        "lastNotificationPackage" to lastPkg,
                        "lastNotificationText" to lastText
                    ))
                }

                "sendHeartbeatNow" -> {
                    bgExecutor.execute {
                        try {
                            val baseUrl = prefs.getString(
                                UpiNotificationListenerService.KEY_BASE_URL,
                                UpiNotificationListenerService.DEFAULT_BASE_URL
                            )?.trimEnd('/') ?: UpiNotificationListenerService.DEFAULT_BASE_URL

                            val secret = prefs.getString(
                                UpiNotificationListenerService.KEY_WEBHOOK_SECRET,
                                UpiNotificationListenerService.DEFAULT_WEBHOOK_SECRET
                            ) ?: UpiNotificationListenerService.DEFAULT_WEBHOOK_SECRET

                            val bm = getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
                            val battery = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 100
                            val model = "${Build.MANUFACTURER} ${Build.MODEL}"

                            val url = URL("$baseUrl/api/webhooks/listener-heartbeat")
                            val conn = url.openConnection() as HttpURLConnection
                            conn.requestMethod = "POST"
                            conn.connectTimeout = 8000
                            conn.readTimeout = 8000
                            conn.doOutput = true
                            conn.setRequestProperty("Content-Type", "application/json; utf-8")
                            conn.setRequestProperty("Accept", "application/json")
                            conn.setRequestProperty("x-webhook-secret", secret)

                            val payload = JSONObject().apply {
                                put("batteryLevel", if (battery >= 0) battery else 100)
                                put("listenerConnected", prefs.getBoolean(UpiNotificationListenerService.KEY_IS_CONNECTED, false))
                                put("phoneModel", model)
                            }

                            OutputStreamWriter(conn.outputStream).use { w ->
                                w.write(payload.toString())
                                w.flush()
                            }

                            val code = conn.responseCode
                            conn.disconnect()

                            if (code in 200..299) {
                                prefs.edit().putLong(UpiNotificationListenerService.KEY_LAST_HEARTBEAT, System.currentTimeMillis()).apply()
                                runOnUiThread {
                                    result.success(mapOf("success" to true, "statusCode" to code, "battery" to battery))
                                }
                            } else {
                                runOnUiThread {
                                    result.error("HTTP_$code", "Server responded with status $code", null)
                                }
                            }
                        } catch (e: Exception) {
                            runOnUiThread {
                                result.error("NETWORK_ERROR", e.message, null)
                            }
                        }
                    }
                }

                else -> result.notImplemented()
            }
        }
    }

    private fun force120Hz() {
        try {
            val win = window ?: return
            val layoutParams = win.attributes

            // Android 11+ (API 30+): preferredRefreshRate
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                layoutParams.preferredRefreshRate = 120.0f
            }

            // Android 6.0+ (API 23+): preferredDisplayModeId
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val display: Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    display
                } else {
                    @Suppress("DEPRECATION")
                    windowManager?.defaultDisplay
                }

                display?.let { d ->
                    val modes = d.supportedModes
                    val currentMode = d.mode
                    val matchingResModes = modes?.filter {
                        it.physicalWidth == currentMode.physicalWidth &&
                        it.physicalHeight == currentMode.physicalHeight
                    } ?: emptyList()

                    val candidates = if (matchingResModes.isNotEmpty()) matchingResModes else (modes?.toList() ?: emptyList())

                    // Find 120Hz mode (~119.0 - 121.0 Hz) or fallback to highest refresh rate
                    val mode120 = candidates.firstOrNull { mode ->
                        mode.refreshRate in 119.0f..121.0f
                    } ?: candidates.maxByOrNull { it.refreshRate }

                    if (mode120 != null) {
                        layoutParams.preferredDisplayModeId = mode120.modeId
                    }
                }
            }

            // If Android 12+ (API 31+) runtime supports preferredMin/MaxDisplayRefreshRate, apply them
            if (Build.VERSION.SDK_INT >= 31) {
                try {
                    val minField = layoutParams.javaClass.getField("preferredMinDisplayRefreshRate")
                    val maxField = layoutParams.javaClass.getField("preferredMaxDisplayRefreshRate")
                    minField.setFloat(layoutParams, 120.0f)
                    maxField.setFloat(layoutParams, 120.0f)
                } catch (_: Throwable) {
                    // Ignored if not present in the platform runtime
                }
            }

            win.attributes = layoutParams
        } catch (_: Exception) {
            // Ignore any platform-specific layout exceptions
        }
    }
}
