.class Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService$ReturnRunnable;
.super Ljava/lang/Object;
.source "WelcomeAccessibilityService.java"

# interfaces
.implements Ljava/lang/Runnable;


# instance fields
.field final synthetic this$0:Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;


# direct methods
.method constructor <init>(Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;)V
    .locals 0

    iput-object p1, p0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService$ReturnRunnable;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 2

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService$ReturnRunnable;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;

    sget-object v1, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->lastPackage:Ljava/lang/String;

    invoke-static {v0, v1}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->isAppStillForeground(Landroid/content/Context;Ljava/lang/String;)Z

    move-result v1

    if-eqz v1, :cond_0

    return-void

    :cond_0
    invoke-virtual {v0}, Lcom/cielodeloro/guestwelcome/WelcomeAccessibilityService;->launchWelcome()V

    return-void
.end method
