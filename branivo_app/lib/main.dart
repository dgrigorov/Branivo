import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/api/dio_client.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/anonymous_session/data/repositories/anonymous_session_repository.dart';
import 'features/fleet/data/repositories/fleet_repository.dart';
import 'features/ocr/data/repositories/ocr_repository.dart';
import 'features/ocr/data/repositories/mlkit_ocr_repository.dart';
import 'features/payments/data/payment_api_repository.dart';
import 'features/policies/data/repositories/policy_repository.dart';
import 'features/registration/data/repositories/client_auth_repository.dart';
import 'features/quotes/data/quote_api_repository.dart';
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
  await Hive.openBox<dynamic>('onboarding');

  const storage = FlutterSecureStorage();
  final dio = DioClient.instance;

  final vehiclesRepository = VehiclesRepository(dio: dio);
  final vehicleApiRepository = VehicleApiRepository(dio: dio, storage: storage);
  final OcrRepository ocrApiRepository = MlKitOcrRepository(dio: dio);
  final paymentApiRepository = PaymentApiRepository(dio: dio);
  final anonSessionRepository = AnonymousSessionRepository(dio: dio);
  final policyRepository = PolicyRepository(dio: dio);
  final fleetRepository = FleetRepository(dio: dio);
  final clientAuthRepository = ClientAuthRepository(dio: dio, storage: storage);
  final quoteApiRepository = QuoteApiRepository(dio: dio);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<VehiclesRepository>.value(value: vehiclesRepository),
        RepositoryProvider<VehicleApiRepository>.value(
            value: vehicleApiRepository),
        RepositoryProvider<OcrRepository>.value(value: ocrApiRepository),
        RepositoryProvider<PaymentApiRepository>.value(
            value: paymentApiRepository),
        RepositoryProvider<AnonymousSessionRepository>.value(
            value: anonSessionRepository),
        RepositoryProvider<PolicyRepository>.value(value: policyRepository),
        RepositoryProvider<FleetRepository>.value(value: fleetRepository),
        RepositoryProvider<ClientAuthRepository>.value(
            value: clientAuthRepository),
        RepositoryProvider<QuoteApiRepository>.value(
            value: quoteApiRepository),
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
