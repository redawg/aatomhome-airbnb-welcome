.class Lcom/cielodeloro/guestwelcome/WelcomeDreamService$2;
.super Ljava/lang/Object;
.source "WelcomeDreamService.java"

# interfaces
.implements Ljava/lang/Runnable;


# instance fields
.field final synthetic this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;


# direct methods
.method constructor <init>(Lcom/cielodeloro/guestwelcome/WelcomeDreamService;)V
    .locals 0

    iput-object p1, p0, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$2;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 1

    iget-object v0, p0, Lcom/cielodeloro/guestwelcome/WelcomeDreamService$2;->this$0:Lcom/cielodeloro/guestwelcome/WelcomeDreamService;

    invoke-virtual {v0}, Lcom/cielodeloro/guestwelcome/WelcomeDreamService;->openWelcome()V

    return-void
.end method
