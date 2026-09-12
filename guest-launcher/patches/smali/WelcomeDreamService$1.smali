.class Lcom/cielodeloro/guestwelcome/WelcomeDreamService$1;
.super Ljava/lang/Object;
.source "WelcomeDreamService.java"

# interfaces
.implements Landroid/view/View$OnClickListener;


# instance fields
.field final synthetic this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;


# direct methods
.method constructor <init>(Lcom/cielodeloro/guestwelcome/WelcomeDreamService;)V
    .locals 0

    iput-object p1, p0, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$1;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onClick(Landroid/view/View;)V
    .locals 2

    iget-object p1, p0, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$1;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;

    invoke-virtual {p1}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService;->openWelcome()V

    return-void
.end method
