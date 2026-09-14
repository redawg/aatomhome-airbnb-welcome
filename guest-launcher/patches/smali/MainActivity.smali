.class public Lcom/aatomhome/guestwelcome/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"


# instance fields
.field private hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

.field private webView:Landroid/webkit/WebView;


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method private applyImmersiveFullscreen()V
    .locals 2

    invoke-virtual {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->getWindow()Landroid/view/Window;

    move-result-object v0

    const/16 v1, 0x80

    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    invoke-virtual {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->getWindow()Landroid/view/Window;

    move-result-object v0

    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;

    move-result-object v0

    const/16 v1, 0x1706

    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V

    return-void
.end method

.method private applyHubUrlExtra(Ljava/lang/String;)V
    .locals 1

    if-eqz p1, :cond_0

    invoke-virtual {p1}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object p1

    invoke-virtual {p1}, Ljava/lang/String;->length()I

    move-result v0

    if-lez v0, :cond_0

    iget-object v0, p0, Lcom/aatomhome/guestwelcome/MainActivity;->hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-virtual {v0, p1}, Lcom/aatomhome/guestwelcome/HubConfig;->applyHubUrl(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method private onboardUrl()Ljava/lang/String;
    .locals 2

    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    iget-object v1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-virtual {v1}, Lcom/aatomhome/guestwelcome/HubConfig;->hubBaseUrl()Ljava/lang/String;

    move-result-object v1

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, "/guest/onboard/"

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    return-object v0
.end method

.method private startPageUrl()Ljava/lang/String;
    .locals 2

    invoke-virtual {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->getIntent()Landroid/content/Intent;

    move-result-object v0

    const-string v1, "hub_url"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_guest

    invoke-virtual {v0}, Ljava/lang/String;->trim()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/String;->length()I

    move-result v1

    if-lez v1, :cond_guest

    const-string v1, "/guest/onboard"

    invoke-virtual {v0, v1}, Ljava/lang/String;->contains(Ljava/lang/CharSequence;)Z

    move-result v1

    if-eqz v1, :cond_onboard

    :cond_guest
    iget-object v0, p0, Lcom/aatomhome/guestwelcome/MainActivity;->hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-virtual {v0}, Lcom/aatomhome/guestwelcome/HubConfig;->guestUrl()Ljava/lang/String;

    move-result-object v0

    return-object v0

    :cond_onboard
    return-object v0
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .locals 4

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-direct {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->applyImmersiveFullscreen()V

    new-instance p1, Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-direct {p1, p0}, Lcom/aatomhome/guestwelcome/HubConfig;-><init>(Landroid/content/Context;)V

    iput-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-virtual {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->getIntent()Landroid/content/Intent;

    move-result-object p1

    const-string v0, "hub_url"

    invoke-virtual {p1, v0}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->applyHubUrlExtra(Ljava/lang/String;)V

    sget p1, Lcom/aatomhome/guestwelcome/R$layout;->activity_main:I

    invoke-virtual {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->setContentView(I)V

    sget p1, Lcom/aatomhome/guestwelcome/R$id;->webview:I

    invoke-virtual {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->findViewById(I)Landroid/view/View;

    move-result-object p1

    check-cast p1, Landroid/webkit/WebView;

    iput-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {p1}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object p1

    const/4 v0, 0x1

    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    const/4 v1, 0x0

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V

    const/16 v2, 0x64

    invoke-virtual {p1, v2}, Landroid/webkit/WebSettings;->setTextZoom(I)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    new-instance v2, Landroid/webkit/WebViewClient;

    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V

    invoke-virtual {p1, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    new-instance v2, Landroid/webkit/WebChromeClient;

    invoke-direct {v2}, Landroid/webkit/WebChromeClient;-><init>()V

    invoke-virtual {p1, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    new-instance v2, Lcom/aatomhome/guestwelcome/GuestLauncherBridge;

    iget-object v3, p0, Lcom/aatomhome/guestwelcome/MainActivity;->hubConfig:Lcom/aatomhome/guestwelcome/HubConfig;

    invoke-direct {v2, p0, v3}, Lcom/aatomhome/guestwelcome/GuestLauncherBridge;-><init>(Landroid/content/Context;Lcom/aatomhome/guestwelcome/HubConfig;)V

    const-string v3, "GuestLauncher"

    invoke-virtual {p1, v2, v3}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->setInitialScale(I)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->setVerticalScrollBarEnabled(Z)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {p1, v1}, Landroid/webkit/WebView;->setHorizontalScrollBarEnabled(Z)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    const v0, -0xf3edde

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-direct {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->startPageUrl()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    new-instance p1, Landroid/content/Intent;

    const-class v0, Lcom/aatomhome/guestwelcome/TvAgentService;

    invoke-direct {p1, p0, v0}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    invoke-virtual {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->startService(Landroid/content/Intent;)Landroid/content/ComponentName;

    return-void
.end method

.method public onKeyDown(ILandroid/view/KeyEvent;)Z
    .locals 1

    const/4 v0, 0x4

    if-ne p1, v0, :cond_0

    iget-object v0, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z

    move-result v0

    if-eqz v0, :cond_0

    iget-object v0, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V

    const/4 p1, 0x1

    return p1

    :cond_0
    invoke-super {p0, p1, p2}, Landroid/app/Activity;->onKeyDown(ILandroid/view/KeyEvent;)Z

    move-result p1

    return p1
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 2

    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    invoke-virtual {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->setIntent(Landroid/content/Intent;)V

    const-string v0, "hub_url"

    invoke-virtual {p1, v0}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p1

    invoke-direct {p0, p1}, Lcom/aatomhome/guestwelcome/MainActivity;->applyHubUrlExtra(Ljava/lang/String;)V

    iget-object p1, p0, Lcom/aatomhome/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz p1, :cond_0

    invoke-direct {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->startPageUrl()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    :cond_0
    return-void
.end method

.method protected onResume()V
    .locals 0

    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    invoke-direct {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->applyImmersiveFullscreen()V

    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .locals 0

    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V

    if-eqz p1, :cond_0

    invoke-direct {p0}, Lcom/aatomhome/guestwelcome/MainActivity;->applyImmersiveFullscreen()V

    :cond_0
    return-void
.end method
