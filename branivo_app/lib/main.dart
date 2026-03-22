import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/ocr/data/repositories/ocr_api_repository.dart';
import 'features/payments/data/payment_api_repository.dart';
import 'features/vehicles/data/repositories/vehicle_api_repository.dart';
import 'features/vehicles/data/repositories/vehicles_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // flutter_stripe setup — publishable key configured before runApp
  Stripe.publishableKey = const String.fromEnvironment(
    'STRIPE_PUBLISHABLE_KEY',
    defaultValue: 'pk_test_placeholder',
  );
  // КРИТИЧНО: без merchantIdentifier, Apple Pay бутонът не се показва (без грешка!)
  Stripe.merchantIdentifier = 'merchant.com.branivo.app';
  // Необходимо за redirect-based payment methods (3DS, banktransfer)
  Stripe.urlScheme = 'branivo';
  await Stripe.instance.applySettings();

  await Hive.initFlutter();
  await Hive.openBox<dynamic>('policies');
  await Hive.openBox<dynamic>('tenant_theme');

  const storage = FlutterSecureStorage();
  final dio = Dio();

  final vehiclesRepository = VehiclesRepository(dio: dio, storage: storage);
  final vehicleApiRepository = VehicleApiRepository(dio: dio, storage: storage);
  final ocrApiRepository = OcrApiRepository(dio: dio);
  final paymentApiRepository = PaymentApiRepository(dio: dio);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<VehiclesRepository>.value(value: vehiclesRepository),
        RepositoryProvider<VehicleApiRepository>.value(
            value: vehicleApiRepository),
        RepositoryProvider<OcrApiRepository>.value(value: ocrApiRepository),
        RepositoryProvider<PaymentApiRepository>.value(
            value: paymentApiRepository),
      ],
      child: const BranivoApp(),
    ),
  );
}

class BranivoApp extends StatelessWidget {
  const BranivoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Branivo',
      theme: AppTheme.buildTheme(),
      routerConfig: AppRouter.router,
      debugShowCheckedModeBanner: false,
    );
  }
}
