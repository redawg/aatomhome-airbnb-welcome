.class public final Lcom/cielodeloro/guestwelcome/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.kt"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/cielodeloro/guestwelcome/MainActivity$Companion;
    }
.end annotation

.annotation system Ldalvik/annotation/SourceDebugExtension;
    value = "SMAP\nMainActivity.kt\nKotlin\n*S Kotlin\n*F\n+ 1 MainActivity.kt\ncom/cielodeloro/guestwelcome/MainActivity\n+ 2 fake.kt\nkotlin/jvm/internal/FakeKt\n*L\n1#1,53:1\n1#2:54\n*E\n"
.end annotation

.annotation runtime Lkotlin/Metadata;
    d1 = {
        "\u0000:\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\u0008\u0003\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\u0008\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u000b\n\u0000\n\u0002\u0010\u0008\n\u0000\n\u0002\u0018\u0002\n\u0002\u0008\u0002\u0018\u0000 \u00132\u00020\u0001:\u0001\u0013B\u0007\u00a2\u0006\u0004\u0008\u0002\u0010\u0003J\u0012\u0010\u0006\u001a\u00020\u00072\u0008\u0010\u0008\u001a\u0004\u0018\u00010\tH\u0015J\u0010\u0010\n\u001a\u00020\u00072\u0006\u0010\u000b\u001a\u00020\u000cH\u0014J\u001a\u0010\r\u001a\u00020\u000e2\u0006\u0010\u000f\u001a\u00020\u00102\u0008\u0010\u0011\u001a\u0004\u0018\u00010\u0012H\u0016R\u000e\u0010\u0004\u001a\u00020\u0005X\u0082.\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0014"
    }
    d2 = {
        "Lcom/cielodeloro/guestwelcome/MainActivity;",
        "Landroid/app/Activity;",
        "<init>",
        "()V",
        "webView",
        "Landroid/webkit/WebView;",
        "onCreate",
        "",
        "savedInstanceState",
        "Landroid/os/Bundle;",
        "onNewIntent",
        "intent",
        "Landroid/content/Intent;",
        "onKeyDown",
        "",
        "keyCode",
        "",
        "event",
        "Landroid/view/KeyEvent;",
        "Companion",
        "app_debug"
    }
    k = 0x1
    mv = {
        0x2,
        0x0,
        0x0
    }
    xi = 0x30
.end annotation


# static fields
.field public static final Companion:Lcom/cielodeloro/guestwelcome/MainActivity$Companion;

.field private static final DEFAULT_HUB_URL:Ljava/lang/String; = "http://172.18.1.137:8080/guest/"


# instance fields
.field private webView:Landroid/webkit/WebView;


# direct methods
.method static constructor <clinit>()V
    .locals 2

    new-instance v0, Lcom/cielodeloro/guestwelcome/MainActivity$Companion;

    const/4 v1, 0x0

    invoke-direct {v0, v1}, Lcom/cielodeloro/guestwelcome/MainActivity$Companion;-><init>(Lkotlin/jvm/internal/DefaultConstructorMarker;)V

    sput-object v0, Lcom/cielodeloro/guestwelcome/MainActivity;->Companion:Lcom/cielodeloro/guestwelcome/MainActivity$Companion;

    return-void
.end method

.method public constructor <init>()V
    .locals 0

    .line 11
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .locals 5
    .param p1, "savedInstanceState"    # Landroid/os/Bundle;

    .line 17
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 18
    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/MainActivity;->applyImmersiveFullscreen()V

    .line 19
    sget v0, Lcom/cielodeloro/guestwelcome/R$layout;->activity_main:I

    invoke-virtual {p0, v0}, Lcom/cielodeloro/guestwelcome/MainActivity;->setContentView(I)V

    .line 20
    sget v0, Lcom/cielodeloro/guestwelcome/R$id;->webview:I

    invoke-virtual {p0, v0}, Lcom/cielodeloro/guestwelcome/MainActivity;->findViewById(I)Landroid/view/View;

    move-result-object v0

    check-cast v0, Landroid/webkit/WebView;

    iput-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    .line 21
    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    const/4 v1, 0x0

    const-string v2, "webView"

    if-nez v0, :cond_0

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_0
    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object v0

    .local v0, "$this$onCreate_u24lambda_u240":Landroid/webkit/WebSettings;
    const/4 v3, 0x0

    .line 22
    .local v3, "$i$a$-apply-MainActivity$onCreate$1":I
    const/4 v4, 0x1

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    .line 23
    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    .line 24
    const/4 v4, 0x0

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    .line 25
    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    const/4 v4, 0x1

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    const/4 v4, 0x0

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V

    const/16 v4, 0x64

    invoke-virtual {v0, v4}, Landroid/webkit/WebSettings;->setTextZoom(I)V

    .line 26
    nop

    .line 21
    .end local v0    # "$this$onCreate_u24lambda_u240":Landroid/webkit/WebSettings;
    .end local v3    # "$i$a$-apply-MainActivity$onCreate$1":I
    nop

    .line 27
    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_1

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_1
    new-instance v3, Landroid/webkit/WebViewClient;

    invoke-direct {v3}, Landroid/webkit/WebViewClient;-><init>()V

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    .line 28
    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_2

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_2
    new-instance v3, Landroid/webkit/WebChromeClient;

    invoke-direct {v3}, Landroid/webkit/WebChromeClient;-><init>()V

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    .line 29
    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_3

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_3
    new-instance v3, Lcom/cielodeloro/guestwelcome/GuestLauncherBridge;

    move-object v4, p0

    check-cast v4, Landroid/content/Context;

    invoke-direct {v3, v4}, Lcom/cielodeloro/guestwelcome/GuestLauncherBridge;-><init>(Landroid/content/Context;)V

    const-string v4, "GuestLauncher"

    invoke-virtual {v0, v3, v4}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_3a

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_3a
    const/16 v3, 0x64

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setInitialScale(I)V

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_3b

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_3b
    const/4 v3, 0x0

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setVerticalScrollBarEnabled(Z)V

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_3c

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_3c
    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setHorizontalScrollBarEnabled(Z)V

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_3d

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_3d
    const v3, -0xf3edde

    invoke-virtual {v0, v3}, Landroid/webkit/WebView;->setBackgroundColor(I)V

    .line 31
    invoke-virtual {p0}, Lcom/cielodeloro/guestwelcome/MainActivity;->getIntent()Landroid/content/Intent;

    move-result-object v0

    const-string v3, "hub_url"

    invoke-virtual {v0, v3}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    if-nez v0, :cond_4

    const-string v0, "http://172.18.1.137:8080/guest/"

    .line 32
    .local v0, "hubUrl":Ljava/lang/String;
    :cond_4
    iget-object v3, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v3, :cond_5

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    goto :goto_0

    :cond_5
    move-object v1, v3

    :goto_0
    invoke-virtual {v1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    .line 33
    return-void
.end method

.method private applyImmersiveFullscreen()V
    .locals 2

    invoke-virtual {p0}, Lcom/cielodeloro/guestwelcome/MainActivity;->getWindow()Landroid/view/Window;

    move-result-object v0

    const/16 v1, 0x80

    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    invoke-virtual {p0}, Lcom/cielodeloro/guestwelcome/MainActivity;->getWindow()Landroid/view/Window;

    move-result-object v0

    invoke-virtual {v0}, Landroid/view/Window;->getDecorView()Landroid/view/View;

    move-result-object v0

    const/16 v1, 0x1706

    invoke-virtual {v0, v1}, Landroid/view/View;->setSystemUiVisibility(I)V

    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .locals 0

    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V

    if-eqz p1, :cond_0

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/MainActivity;->applyImmersiveFullscreen()V

    :cond_0
    return-void
.end method

.method public onKeyDown(ILandroid/view/KeyEvent;)Z
    .locals 3
    .param p1, "keyCode"    # I
    .param p2, "event"    # Landroid/view/KeyEvent;

    .line 42
    const/4 v0, 0x4

    if-ne p1, v0, :cond_2

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    const/4 v1, 0x0

    const-string v2, "webView"

    if-nez v0, :cond_0

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    move-object v0, v1

    :cond_0
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z

    move-result v0

    if-eqz v0, :cond_2

    .line 43
    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v0, :cond_1

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    goto :goto_0

    :cond_1
    move-object v1, v0

    :goto_0
    invoke-virtual {v1}, Landroid/webkit/WebView;->goBack()V

    .line 44
    const/4 v0, 0x1

    return v0

    .line 46
    :cond_2
    invoke-super {p0, p1, p2}, Landroid/app/Activity;->onKeyDown(ILandroid/view/KeyEvent;)Z

    move-result v0

    return v0
.end method

.method protected onNewIntent(Landroid/content/Intent;)V
    .locals 3
    .param p1, "intent"    # Landroid/content/Intent;

    const-string v0, "intent"

    invoke-static {p1, v0}, Lkotlin/jvm/internal/Intrinsics;->checkNotNullParameter(Ljava/lang/Object;Ljava/lang/String;)V

    .line 36
    invoke-super {p0, p1}, Landroid/app/Activity;->onNewIntent(Landroid/content/Intent;)V

    .line 37
    invoke-virtual {p0, p1}, Lcom/cielodeloro/guestwelcome/MainActivity;->setIntent(Landroid/content/Intent;)V

    .line 38
    const-string v0, "hub_url"

    invoke-virtual {p1, v0}, Landroid/content/Intent;->getStringExtra(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :cond_1

    .line 54
    .local v0, "it":Ljava/lang/String;
    const/4 v1, 0x0

    .line 38
    .local v1, "$i$a$-let-MainActivity$onNewIntent$1":I
    iget-object v2, p0, Lcom/cielodeloro/guestwelcome/MainActivity;->webView:Landroid/webkit/WebView;

    if-nez v2, :cond_0

    const-string v2, "webView"

    invoke-static {v2}, Lkotlin/jvm/internal/Intrinsics;->throwUninitializedPropertyAccessException(Ljava/lang/String;)V

    const/4 v2, 0x0

    :cond_0
    invoke-virtual {v2, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    .line 39
    .end local v0    # "it":Ljava/lang/String;
    .end local v1    # "$i$a$-let-MainActivity$onNewIntent$1":I
    :cond_1
    return-void
.end method
