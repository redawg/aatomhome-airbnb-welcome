package com.cielodeloro.guestwelcome

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.app.Activity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var hubConfig: HubConfig

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyImmersiveFullscreen()
        hubConfig = HubConfig(this)

        intent?.getStringExtra("hub_url")?.let {
            hubConfig.applyHubUrl(hubConfig.activeProfileId, it.removeSuffix("/guest/").removeSuffix("/guest"))
        }
        intent?.getStringExtra("hub_profile")?.let {
            hubConfig.activeProfileId = HubConfig.normalizeProfileId(it)
        }

        if (!hubConfig.hasAnyClaimedProfile()) {
            showClaimScreen()
            return
        }

        startAgentService()
        showWelcomeWebView()
    }

    private fun showClaimScreen() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            setBackgroundColor(0xFF0C1222.toInt())
        }

        val title = TextView(this).apply {
            text = "Choose hub backend"
            textSize = 28f
            setTextColor(0xFFFFFFFF.toInt())
            setTypeface(null, Typeface.BOLD)
        }
        val subtitle = TextView(this).apply {
            text = "Register this TV on Hub A and/or Hub B (configure URLs in claim screen)"
            textSize = 15f
            setTextColor(0xFFAAB4C8.toInt())
        }

        val profileGroup = RadioGroup(this).apply {
            orientation = RadioGroup.VERTICAL
        }
        for (profile in hubConfig.profiles) {
            val claimed = hubConfig.isClaimed(profile.id)
            val status = if (claimed) " ✓ registered" else ""
            val radio = RadioButton(this).apply {
                id = View.generateViewId()
                text = "${profile.label}$status\n${hubConfig.hubBaseUrl(profile.id)}"
                textSize = 16f
                tag = profile.id
                isChecked = profile.id == hubConfig.activeProfileId
            }
            profileGroup.addView(radio)
        }
        profileGroup.setOnCheckedChangeListener { group, checkedId ->
            val btn = group.findViewById<RadioButton>(checkedId)
            val profileId = btn?.tag as? String
            if (profileId != null) hubConfig.activeProfileId = profileId
        }

        val hubUrlInput = EditText(this).apply {
            hint = "Hub URL override (optional)"
            textSize = 16f
            setText(hubConfig.hubBaseUrl())
        }

        val codeInput = EditText(this).apply {
            hint = "ROOM CODE (from staff)"
            textSize = 22f
        }

        val status = TextView(this).apply {
            textSize = 16f
            setTextColor(0xFFFFCC66.toInt())
        }

        val claimBtn = Button(this).apply {
            text = "Claim on selected hub"
            setOnClickListener {
                val profileId = hubConfig.activeProfileId
                hubConfig.applyHubUrl(profileId, hubUrlInput.text.toString())
                val code = codeInput.text.toString().trim()
                if (code.isEmpty()) {
                    status.text = "Enter a room code"
                    return@setOnClickListener
                }
                isEnabled = false
                status.text = "Claiming on ${hubConfig.activeProfile.label}…"
                Thread {
                    val result = claimByCode(profileId, code)
                    runOnUiThread {
                        isEnabled = true
                        if (result != null) {
                            hubConfig.markClaimed(profileId, result.deviceId, result.hubUrl)
                            status.text = "Claimed on ${hubConfig.activeProfile.label} (device ${result.deviceId})"
                            startAgentService()
                            if (hubConfig.hasAnyClaimedProfile()) {
                                showWelcomeWebView()
                            }
                        } else {
                            status.text = "Claim failed — check code, hub URL, and network path"
                        }
                    }
                }.start()
            }
        }

        val selfRegBtn = Button(this).apply {
            text = "Self-register (pending approval)"
            setOnClickListener {
                val profileId = hubConfig.activeProfileId
                hubConfig.applyHubUrl(profileId, hubUrlInput.text.toString())
                isEnabled = false
                status.text = "Registering on ${hubConfig.activeProfile.label}…"
                Thread {
                    val pending = selfRegister(profileId)
                    runOnUiThread {
                        isEnabled = true
                        if (pending != null) {
                            hubConfig.setClaimCode(profileId, pending.claimCode)
                            status.text = "Pending on ${hubConfig.activeProfile.label} — code ${pending.claimCode}"
                        } else {
                            status.text = "Self-register failed"
                        }
                    }
                }.start()
            }
        }

        val switchHubBtn = Button(this).apply {
            text = "Open welcome (active hub)"
            setOnClickListener {
                if (hubConfig.isClaimed(hubConfig.activeProfileId)) {
                    startAgentService()
                    showWelcomeWebView()
                } else {
                    status.text = "Claim on this hub first, or switch profile above"
                }
            }
        }

        val settingsBtn = Button(this).apply {
            text = "Switch welcome hub"
            setOnClickListener { showHubPickerDialog() }
        }

        layout.addView(title)
        layout.addView(subtitle)
        layout.addView(profileGroup)
        layout.addView(hubUrlInput)
        layout.addView(codeInput)
        layout.addView(claimBtn)
        layout.addView(selfRegBtn)
        layout.addView(switchHubBtn)
        layout.addView(settingsBtn)
        layout.addView(status)
        setContentView(layout)
    }

    private fun showHubPickerDialog() {
        val claimed = hubConfig.claimedProfileIds()
        if (claimed.isEmpty()) return
        val labels = claimed.map { id ->
            hubConfig.profiles.first { it.id == id }.label
        }.toTypedArray()
        android.app.AlertDialog.Builder(this)
            .setTitle("Welcome hub")
            .setItems(labels) { _, which ->
                hubConfig.activeProfileId = claimed[which]
                if (::webView.isInitialized) {
                    webView.loadUrl(hubConfig.guestUrl())
                } else {
                    showWelcomeWebView()
                }
            }
            .show()
    }

    private data class ClaimResult(val deviceId: Int, val hubUrl: String?)
    private data class PendingResult(val claimCode: String?)

    private fun claimByCode(profileId: String, code: String): ClaimResult? {
        val base = hubConfig.hubBaseUrl(profileId)
        val url = "$base/api/registry/claim-by-code"
        val body = JSONObject()
        body.put("claim_code", code)
        body.put("device_fingerprint", deviceFingerprint())
        val resp = httpPost(url, body.toString()) ?: return null
        val json = JSONObject(resp)
        if (!json.optBoolean("ok", false)) return null
        return ClaimResult(json.optInt("device_id", -1), json.optString("hub_public_url", base))
    }

    private fun selfRegister(profileId: String): PendingResult? {
        val base = hubConfig.hubBaseUrl(profileId)
        val url = "$base/api/registry/self-register"
        val body = JSONObject()
        body.put("host", localIpv4())
        body.put("name", android.os.Build.MODEL)
        body.put("device_fingerprint", deviceFingerprint())
        body.put("product_model", android.os.Build.MODEL)
        val resp = httpPost(url, body.toString()) ?: return null
        val json = JSONObject(resp)
        if (!json.optBoolean("ok", false)) return null
        json.optString("hub_public_url", null)?.let { hubConfig.applyHubUrl(profileId, it) }
        return PendingResult(json.optString("claim_code", null))
    }

    private fun deviceFingerprint(): String =
        android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.ANDROID_ID)
            ?: android.os.Build.MODEL

    private fun httpPost(url: String, jsonBody: String): String? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 20000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        return try {
            OutputStreamWriter(conn.outputStream).use { it.write(jsonBody) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            BufferedReader(InputStreamReader(stream)).use { it.readText() }
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun localIpv4(): String {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress ?: ""
                    }
                }
            }
        } catch (_: Exception) {
        }
        return "0.0.0.0"
    }

    private fun startAgentService() {
        val intent = Intent(this, TvAgentService::class.java)
        intent.putExtra(TvAgentService.EXTRA_PROFILE_IDS, hubConfig.claimedProfileIds().toTypedArray())
        startService(intent)
    }

    private fun showWelcomeWebView() {
        if (!hubConfig.isClaimed(hubConfig.activeProfileId)) {
            val first = hubConfig.claimedProfileIds().firstOrNull()
            if (first != null) hubConfig.activeProfileId = first
        }
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webview)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
        }

        webView.setInitialScale(100)
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setBackgroundColor(0xFF0C1222.toInt())

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(GuestLauncherBridge(this, hubConfig), "GuestLauncher")

        webView.loadUrl(hubConfig.guestUrl())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveFullscreen()
    }

    @Suppress("DEPRECATION")
    private fun applyImmersiveFullscreen() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra("hub_profile")?.let {
            hubConfig.activeProfileId = HubConfig.normalizeProfileId(it)
        }
        intent.getStringExtra("hub_url")?.let {
            hubConfig.applyHubUrl(hubConfig.activeProfileId, it.removeSuffix("/guest/").removeSuffix("/guest"))
            if (::webView.isInitialized) webView.loadUrl(hubConfig.guestUrl())
        }
    }

    override fun onResume() {
        super.onResume()
        applyImmersiveFullscreen()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_INFO) {
            showHubPickerDialog()
            return true
        }
        if (::webView.isInitialized && keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        const val DEFAULT_HUB_URL = "http://192.168.2.1:8080/guest/"
    }
}
