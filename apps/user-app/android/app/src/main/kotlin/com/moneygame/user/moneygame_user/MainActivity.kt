package com.moneygame.user.moneygame_user

import android.os.Build
import android.os.Bundle
import android.view.Display
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
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
