package com.aatomhome.guestwelcome

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

class GuestLauncherBridge(
    private val context: Context,
    private val hubConfig: HubConfig? = null,
) {

    @JavascriptInterface
    fun getClaimState(): String {
        val hub = hubConfig ?: return "{}"
        val profile = hub.activeProfileId
        return JSONObject()
            .put("hub_url", hub.hubBaseUrl(profile))
            .put("device_id", hub.deviceId(profile))
            .put("device_session", hub.deviceSession(profile) ?: JSONObject.NULL)
            .put("device_fingerprint", hub.deviceFingerprint(profile) ?: JSONObject.NULL)
            .put("claim_code", hub.claimCode(profile) ?: JSONObject.NULL)
            .put("claimed", hub.hasPersistedClaim(profile))
            .toString()
    }

    @JavascriptInterface
    fun saveClaimState(json: String) {
        val hub = hubConfig ?: return
        try {
            val o = JSONObject(json)
            val deviceId = o.optInt("device_id", -1)
            val session = o.optString("device_session", "").trim()
            val fingerprint = o.optString("device_fingerprint", "").trim()
            val hubUrl = o.optString("hub_url", "").trim()
            if (deviceId <= 0 || session.isEmpty()) return
            hub.saveClaimRecord(
                hub.activeProfileId,
                deviceId,
                session,
                fingerprint.ifEmpty { hub.deviceFingerprint() ?: "tv-native" },
                hubUrl.ifEmpty { hub.hubBaseUrl() },
                o.optString("claim_code", null)?.takeIf { it.isNotBlank() },
            )
        } catch (_: Exception) {
            /* ignore malformed JSON from WebView */
        }
    }

    @JavascriptInterface
    fun clearClaimState() {
        hubConfig?.clearClaimRecord()
    }

    @JavascriptInterface
    fun getDisplayMetrics(): String {
        val resMetrics = context.resources.displayMetrics
        val real = DisplayMetrics()
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        @Suppress("DEPRECATION")
        wm?.defaultDisplay?.getRealMetrics(real)

        val widthPx = if (real.widthPixels > 0) real.widthPixels else resMetrics.widthPixels
        val heightPx = if (real.heightPixels > 0) real.heightPixels else resMetrics.heightPixels

        return JSONObject()
            .put("widthPx", widthPx)
            .put("heightPx", heightPx)
            .put("widthCssPx", resMetrics.widthPixels)
            .put("heightCssPx", resMetrics.heightPixels)
            .put("density", resMetrics.density.toDouble())
            .put("densityDpi", resMetrics.densityDpi)
            .toString()
    }

    @JavascriptInterface
    fun getHubUrl(): String {
        return hubConfig?.hubBaseUrl ?: HubConfig.DEFAULT_HUB_BASE
    }

    @JavascriptInterface
    fun getActiveProfileId(): String {
        return hubConfig?.activeProfileId ?: HubConfig.PROFILE_HUB_A
    }

    @JavascriptInterface
    fun listHubProfiles(): String {
        val config = hubConfig ?: return "[]"
        val arr = org.json.JSONArray()
        for (profile in config.profiles) {
            val obj = org.json.JSONObject()
            obj.put("id", profile.id)
            obj.put("label", profile.label)
            obj.put("hub_url", config.hubBaseUrl(profile.id))
            obj.put("claimed", config.isClaimed(profile.id))
            obj.put("device_id", config.deviceId(profile.id))
            arr.put(obj)
        }
        return arr.toString()
    }

    @JavascriptInterface
    fun isAppInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun launchApp(packageName: String) {
        val pm = context.packageManager
        val launch = pm.getLaunchIntentForPackage(packageName)
        if (launch == null) {
            Toast.makeText(context, "App not installed: $packageName", Toast.LENGTH_SHORT).show()
            return
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
    }

    /** Close welcome and open stock Google TV home (apps grid). */
    @JavascriptInterface
    fun closeToGoogleTv() {
        val googleTv = Intent(Intent.ACTION_MAIN).apply {
            setClassName(
                GOOGLE_TV_PACKAGE,
                "$GOOGLE_TV_PACKAGE.home.HomeActivity",
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            context.startActivity(googleTv)
        } catch (_: Exception) {
            val home = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(home)
        }
        (context as? Activity)?.finish()
    }

    @JavascriptInterface
    fun openGoogleTv() = closeToGoogleTv()

    @JavascriptInterface
    fun getLocalIp(): String = AdbSetupHelper.localIpv4()

    /** Stable across app reinstalls — matches TvAgentService poll fingerprint. */
    @JavascriptInterface
    fun getDeviceFingerprint(): String {
        return Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?: Build.MODEL
    }

    @JavascriptInterface
    fun startAdbSetup(): Boolean {
        return try {
            val intent = Intent(context, AdbSetupActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun startTvAgent() {
        val intent = Intent(context, TvAgentService::class.java)
        context.startService(intent)
    }

    @JavascriptInterface
    fun clearStreamingLogins(): String {
        val cleared = JSONArray()
        for (pkg in TvAgentService.DEFAULT_STREAMING_PACKAGES) {
            try {
                val proc = Runtime.getRuntime().exec(arrayOf("pm", "clear", pkg))
                proc.waitFor()
                if (proc.exitValue() == 0) cleared.put(pkg)
            } catch (_: Exception) {
            }
        }
        return cleared.toString()
    }

    companion object {
        private const val GOOGLE_TV_PACKAGE = "com.google.android.apps.tv.launcherx"
    }
}
