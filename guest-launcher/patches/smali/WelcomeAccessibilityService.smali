.class public Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;
.super Landroid/accessibilityservice/AccessibilityService;
.source "WelcomeAccessibilityService.java"


# static fields
.field private static final GOOGLE_TV:Ljava/lang/String; = "com.google.android.apps.tv.launcherx"

.field private static final RETURN_DELAY_MS:J = 0x1f40L

.field private static final WELCOME_PKG:Ljava/lang/String; = "com.cielodeloro.guestwelcome"

.field static lastPackage:Ljava/lang/String;

.field private static returnHandler:Landroid/os/Handler;

.field private static returnRunnable:Ljava/lang/Runnable;


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/accessibilityservice/AccessibilityService;-><init>()V

    return-void
.end method

.method private cancelReturn()V
    .locals 2

    sget-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnHandler:Landroid/os/Handler;

    if-eqz v0, :cond_0

    sget-object v1, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnRunnable:Ljava/lang/Runnable;

    if-eqz v1, :cond_0

    invoke-virtual {v0, v1}, Landroid/os/Handler;->removeCallbacks(Ljava/lang/Runnable;)V

    :cond_0
    return-void
.end method

.method private ensureHandler()V
    .locals 2

    sget-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnHandler:Landroid/os/Handler;

    if-nez v0, :cond_0

    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    sput-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnHandler:Landroid/os/Handler;

    :cond_0
    sget-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnRunnable:Ljava/lang/Runnable;

    if-nez v0, :cond_1

    new-instance v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService$ReturnRunnable;

    invoke-direct {v0, p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService$ReturnRunnable;-><init>(Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;)V

    sput-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnRunnable:Ljava/lang/Runnable;

    :cond_1
    return-void
.end method

.method private isIgnorable(Ljava/lang/String;)Z
    .locals 1

    if-nez p1, :cond_0

    const/4 v0, 0x0

    return v0

    :cond_0
    const-string v0, "com.android.systemui"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_1

    const/4 v0, 0x1

    return v0

    :cond_1
    const-string v0, "android"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_2

    const/4 v0, 0x1

    return v0

    :cond_2
    const-string v0, "com.google.android.tvrecommendations"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_3

    const/4 v0, 0x1

    return v0

    :cond_3
    const-string v0, "com.google.android.katniss"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_4

    const/4 v0, 0x1

    return v0

    :cond_4
    const-string v0, "com.google.android.gms"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_5

    const/4 v0, 0x1

    return v0

    :cond_5
    const-string v0, "com.google.android.gsf"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    return v0
.end method

.method private static isAppStillForeground(Landroid/content/Context;Ljava/lang/String;)Z
    .locals 6

    if-eqz p1, :cond_false

    invoke-virtual {p1}, Ljava/lang/String;->length()I

    move-result v0

    if-nez v0, :cond_has_pkg

    :cond_false
    const/4 v0, 0x0

    return v0

    :cond_has_pkg
    const-string v0, "activity"

    invoke-virtual {p0, v0}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object p0

    check-cast p0, Landroid/app/ActivityManager;

    invoke-virtual {p0}, Landroid/app/ActivityManager;->getRunningAppProcesses()Ljava/util/List;

    move-result-object p0

    if-nez p0, :cond_iter

    const/4 v0, 0x0

    return v0

    :cond_iter
    invoke-interface {p0}, Ljava/util/List;->iterator()Ljava/util/Iterator;

    move-result-object v0

    :goto_loop
    invoke-interface {v0}, Ljava/util/Iterator;->hasNext()Z

    move-result v1

    if-nez v1, :cond_false

    invoke-interface {v0}, Ljava/util/Iterator;->next()Ljava/lang/Object;

    move-result-object v1

    check-cast v1, Landroid/app/ActivityManager$RunningAppProcessInfo;

    iget v2, v1, Landroid/app/ActivityManager$RunningAppProcessInfo;->importance:I

    const/16 v3, 0xc8

    if-gt v2, v3, :goto_loop

    iget-object v2, v1, Landroid/app/ActivityManager$RunningAppProcessInfo;->processName:Ljava/lang/String;

    if-nez v2, :goto_loop

    invoke-virtual {p1, v2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v3

    if-eqz v3, :cond_true

    new-instance v3, Ljava/lang/StringBuilder;

    invoke-direct {v3}, Ljava/lang/StringBuilder;-><init>()V

    invoke-virtual {v3, p1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v4, ":"

    invoke-virtual {v3, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v3}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v3

    invoke-virtual {v2, v3}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v2

    if-eqz v2, :cond_true

    goto :goto_loop

    :cond_true
    const/4 v0, 0x1

    return v0
.end method

.method private scheduleReturn()V
    .locals 4

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->ensureHandler()V

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->cancelReturn()V

    sget-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnHandler:Landroid/os/Handler;

    sget-object v1, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->returnRunnable:Ljava/lang/Runnable;

    const-wide/16 v2, 0x1f40

    invoke-virtual {v0, v1, v2, v3}, Landroid/os/Handler;->postDelayed(Ljava/lang/Runnable;J)Z

    return-void
.end method

.method private shouldReturnFrom(Ljava/lang/String;)Z
    .locals 1

    if-eqz p1, :cond_0

    invoke-virtual {p1}, Ljava/lang/String;->length()I

    move-result v0

    if-nez v0, :cond_1

    :cond_0
    const/4 v0, 0x0

    return v0

    :cond_1
    const-string v0, "com.cielodeloro.guestwelcome"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_2

    const/4 v0, 0x0

    return v0

    :cond_2
    const-string v0, "com.google.android.apps.tv.launcherx"

    invoke-virtual {v0, p1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_3

    const/4 v0, 0x0

    return v0

    :cond_3
    invoke-direct {p0, p1}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->isIgnorable(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_4

    const/4 v0, 0x0

    return v0

    :cond_4
    const/4 v0, 0x1

    return v0
.end method


# virtual methods
.method public launchWelcome()V
    .locals 3

    new-instance v0, Landroid/content/Intent;

    const-class v1, Lcom/cielodeloro/guestwelcome/MainActivity;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const/high16 v1, 0x14000000

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    invoke-virtual {p0, v0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->startActivity(Landroid/content/Intent;)V

    return-void
.end method

.method public onAccessibilityEvent(Landroid/view/accessibility/AccessibilityEvent;)V
    .locals 3

    if-nez p1, :cond_0

    return-void

    :cond_0
    invoke-virtual {p1}, Landroid/view/accessibility/AccessibilityEvent;->getEventType()I

    move-result v0

    const/16 v1, 0x20

    if-eq v0, v1, :cond_1

    return-void

    :cond_1
    invoke-virtual {p1}, Landroid/view/accessibility/AccessibilityEvent;->getPackageName()Ljava/lang/CharSequence;

    move-result-object v0

    if-nez v0, :cond_2

    return-void

    :cond_2
    invoke-interface {v0}, Ljava/lang/CharSequence;->toString()Ljava/lang/String;

    move-result-object v0

    const-string v1, "com.cielodeloro.guestwelcome"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_3

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->cancelReturn()V

    sput-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    return-void

    :cond_3
    const-string v1, "com.google.android.apps.tv.launcherx"

    invoke-virtual {v1, v0}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v1

    if-eqz v1, :cond_5

    sget-object v1, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    invoke-direct {p0, v1}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->shouldReturnFrom(Ljava/lang/String;)Z

    move-result v1

    if-eqz v1, :cond_4

    sget-object v1, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    invoke-static {p0, v1}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->isAppStillForeground(Landroid/content/Context;Ljava/lang/String;)Z

    move-result v1

    if-nez v1, :cond_4

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->scheduleReturn()V

    :cond_4
    sput-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    return-void

    :cond_5
    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->cancelReturn()V

    sput-object v0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    return-void
.end method

.method public onInterrupt()V
    .locals 0

    invoke-direct {p0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->cancelReturn()V

    return-void
.end method

.method protected onServiceConnected()V
    .locals 0

    invoke-super {p0}, Landroid/accessibilityservice/AccessibilityService;->onServiceConnected()V

    return-void
.end method
