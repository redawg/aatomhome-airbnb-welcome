.class public Lcom/cielodeloro/guestwelcome/WelcomeDreamService;
.super Landroid/service/dreams/DreamService;
.source "WelcomeDreamService.java"


# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-direct {p0}, Landroid/service/dreams/DreamService;-><init>()V

    return-void
.end method


# virtual methods
.method public onAttachedToWindow()V
    .locals 8

    invoke-super {p0}, Landroid/service/dreams/DreamService;->onAttachedToWindow()V

    const/4 v0, 0x1

    invoke-virtual {p0, v0}, Landroid/service/dreams/DreamService;->setInteractive(Z)V

    invoke-virtual {p0, v0}, Landroid/service/dreams/DreamService;->setFullscreen(Z)V

    new-instance v0, Landroid/widget/LinearLayout;

    invoke-direct {v0, p0}, Landroid/widget/LinearLayout;-><init>(Landroid/content/Context;)V

    const/16 v1, 0x11

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setGravity(I)V

    const/4 v1, 0x1

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setOrientation(I)V

    const v1, -0x1000000

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->setBackgroundColor(I)V

    const/16 v1, 0x30

    invoke-virtual {v0, v1, v1, v1, v1}, Landroid/widget/LinearLayout;->setPadding(IIII)V

    new-instance v1, Landroid/widget/TextView;

    invoke-direct {v1, p0}, Landroid/widget/TextView;-><init>(Landroid/content/Context;)V

    const-string v2, "Cielo del Oro"

    invoke-virtual {v1, v2}, Landroid/widget/TextView;->setText(Ljava/lang/CharSequence;)V

    const/high16 v2, 0x41c00000    # 24.0f

    invoke-virtual {v1, v2}, Landroid/widget/TextView;->setTextSize(F)V

    const/4 v2, -0x1

    invoke-virtual {v1, v2}, Landroid/widget/TextView;->setTextColor(I)V

    const/16 v3, 0x11

    invoke-virtual {v1, v3}, Landroid/widget/TextView;->setGravity(I)V

    new-instance v3, Landroid/widget/TextView;

    invoke-direct {v3, p0}, Landroid/widget/TextView;-><init>(Landroid/content/Context;)V

    const-string v4, "Press the button below for WiFi, house info, and local tips."

    invoke-virtual {v3, v4}, Landroid/widget/TextView;->setText(Ljava/lang/CharSequence;)V

    const/high16 v4, 0x41800000    # 16.0f

    invoke-virtual {v3, v4}, Landroid/widget/TextView;->setTextSize(F)V

    const v4, -0x333334

    invoke-virtual {v3, v4}, Landroid/widget/TextView;->setTextColor(I)V

    const/16 v4, 0x11

    invoke-virtual {v3, v4}, Landroid/widget/TextView;->setGravity(I)V

    new-instance v4, Landroid/widget/Button;

    invoke-direct {v4, p0}, Landroid/widget/Button;-><init>(Landroid/content/Context;)V

    const-string v5, "View Welcome"

    invoke-virtual {v4, v5}, Landroid/widget/Button;->setText(Ljava/lang/CharSequence;)V

    const/high16 v5, 0x41a00000    # 20.0f

    invoke-virtual {v4, v5}, Landroid/widget/Button;->setTextSize(F)V

    invoke-virtual {v4, v2}, Landroid/widget/Button;->setTextColor(I)V

    new-instance v2, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$1;

    invoke-direct {v2, p0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$1;-><init>(Lcom/cielodeloro/guestwelcome/WelcomeDreamService;)V

    invoke-virtual {v4, v2}, Landroid/widget/Button;->setOnClickListener(Landroid/view/View$OnClickListener;)V

    invoke-virtual {v0, v1}, Landroid/widget/LinearLayout;->addView(Landroid/view/View;)V

    invoke-virtual {v0, v3}, Landroid/widget/LinearLayout;->addView(Landroid/view/View;)V

    invoke-virtual {v0, v4}, Landroid/widget/LinearLayout;->addView(Landroid/view/View;)V

    invoke-virtual {p0, v0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService;->setContentView(Landroid/view/View;)V

    new-instance v0, Landroid/os/Handler;

    invoke-static {}, Landroid/os/Looper;->getMainLooper()Landroid/os/Looper;

    move-result-object v1

    invoke-direct {v0, v1}, Landroid/os/Handler;-><init>(Landroid/os/Looper;)V

    new-instance v1, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$2;

    invoke-direct {v1, p0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$2;-><init>(Lcom/cielodeloro/guestwelcome/WelcomeDreamService;)V

    const-wide v2, 0x6ddd00

    invoke-virtual {v0, v1, v2, v3}, Landroid/os/Handler;->postDelayed(Ljava/lang/Runnable;J)Z

    return-void
.end method

.method public openWelcome()V
    .locals 3

    new-instance v0, Landroid/content/Intent;

    const-class v1, Lcom/cielodeloro/guestwelcome/MainActivity;

    invoke-direct {v0, p0, v1}, Landroid/content/Intent;-><init>(Landroid/content/Context;Ljava/lang/Class;)V

    const/high16 v1, 0x14000000    # FLAG_ACTIVITY_NEW_TASK | CLEAR_TOP

    invoke-virtual {v0, v1}, Landroid/content/Intent;->addFlags(I)Landroid/content/Intent;

    invoke-virtual {p0, v0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService;->startActivity(Landroid/content/Intent;)V

    invoke-virtual {p0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService;->finish()V

    return-void
.end method
