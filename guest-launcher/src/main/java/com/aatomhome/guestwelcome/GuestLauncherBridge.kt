package com.aatomhome.guestwelcome

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface
import android.widget.Toast

class GuestLauncherBridge(
    private val context: Context,
    private val hubConfig: HubConfig? = null,
) {

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

    companion object {
        private const val GOOGLE_TV_PACKAGE = "com.google.android.apps.tv.launcherx"
    }
}
