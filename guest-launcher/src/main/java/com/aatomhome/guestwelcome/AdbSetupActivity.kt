package com.aatomhome.guestwelcome

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Guided wizard — hub cannot toggle secure settings without user action on the TV.
 * Opens system settings for Developer options and Wireless debugging.
 */
class AdbSetupActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var hubConfig: HubConfig
    private lateinit var statusView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hubConfig = HubConfig(this)

        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0C1222"))
            setPadding(64, 48, 64, 48)
        }

        val title = TextView(this).apply {
            text = "Enable hub ADB access"
            textSize = 28f
            setTextColor(Color.WHITE)
            setPadding(0, 0, 0, 24)
        }
        root.addView(title)

        val steps = TextView(this).apply {
            text = """
                The hub needs Wireless debugging so staff can push updates and manage the TV.

                1. Turn on Developer options (About → Build, tap 7 times if needed).
                2. Open Wireless debugging and turn it ON.
                3. Pair with the hub if prompted (use the IP shown on this screen).

                This TV IP: ${AdbSetupHelper.localIpv4().ifBlank { "—" }}
            """.trimIndent()
            textSize = 18f
            setTextColor(Color.parseColor("#C8D0E0"))
            setPadding(0, 0, 0, 32)
        }
        root.addView(steps)

        statusView = TextView(this).apply {
            text = "Tap a button below to open the matching Settings screen."
            textSize = 16f
            setTextColor(Color.parseColor("#8FA3C4"))
            setPadding(0, 0, 0, 24)
        }
        root.addView(statusView)

        fun addBtn(label: String, onClick: () -> Unit) {
            val btn = Button(this).apply {
                text = label
                textSize = 18f
                isAllCaps = false
                setOnClickListener { onClick() }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            )
            lp.bottomMargin = 16
            root.addView(btn, lp)
        }

        addBtn("Open About (enable Developer options)") {
            val ok = AdbSetupHelper.openAboutSettings(this)
            statusView.text = if (ok) "Opened About — tap Build number 7 times, then Back."
            else "Could not open About settings."
        }
        addBtn("Open Developer options") {
            val ok = AdbSetupHelper.openDeveloperSettings(this)
            statusView.text = if (ok) "Opened Developer options — enable USB/wireless debugging."
            else "Could not open Developer options."
        }
        addBtn("Open Wireless debugging") {
            val ok = AdbSetupHelper.openWirelessDebuggingSettings(this)
            statusView.text = if (ok) "Opened Wireless debugging — turn it ON and pair if asked."
            else "Could not open Wireless debugging."
        }
        addBtn("Done — report to hub") {
            reportToHub("complete", "User finished ADB setup wizard")
            statusView.text = "Reported to hub. You can return to Guest Welcome."
            finish()
        }
        addBtn("Cancel") {
            reportToHub("cancelled", "User cancelled ADB setup")
            finish()
        }

        scroll.addView(root)
        setContentView(scroll)
        reportToHub("wizard_opened", "ADB setup wizard opened on TV")
    }

    private fun reportToHub(status: String, message: String) {
        val profileId = hubConfig.activeProfileId
        val deviceId = hubConfig.deviceId(profileId)
        if (deviceId < 0) return
        val base = hubConfig.hubBaseUrl(profileId)
        val body = JSONObject()
            .put("command", "enable_adb")
            .put("ok", status == "complete" || status == "wizard_opened")
            .put("adb_setup_status", status)
            .put("adb_setup_message", message)
            .put("local_ip", AdbSetupHelper.localIpv4())
            .put("profile_id", profileId)
        executor.execute {
            httpPost("$base/api/tv-agent/$deviceId/result", body.toString())
        }
    }

    private fun httpPost(url: String, jsonBody: String) {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 20000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            OutputStreamWriter(conn.outputStream).use { it.write(jsonBody) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            BufferedReader(InputStreamReader(stream)).use { it.readText() }
        } catch (_: Exception) {
        } finally {
            conn.disconnect()
        }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
