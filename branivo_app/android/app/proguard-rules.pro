# flutter_stripe 12.x — prevent 3DS crashes in release builds
-keep class com.stripe.android.** { *; }
-keep class com.google.android.gms.wallet.** { *; }
