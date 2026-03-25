import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../api/dio_client.dart';
import '../../features/auth/bloc/auth_bloc.dart';
import '../../features/auth/screens/auth_gate_screen.dart';
import 'auth_redirect.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/ocr/screens/ocr_wizard_screen.dart';
import '../../features/ocr/bloc/ocr_wizard_bloc.dart';
import '../../features/ocr/data/repositories/ocr_repository.dart';
import '../../features/ocr/data/repositories/ocr_models.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/vehicles/screens/vehicle_validation_screen.dart';
import '../../features/vehicles/bloc/vehicle_validation_bloc.dart';
import '../../features/vehicles/data/repositories/vehicle_api_repository.dart';
import '../../features/quotes/screens/offers_screen.dart';
import '../../features/quotes/bloc/quote_bloc.dart';
import '../../features/quotes/data/quote_api_repository.dart';
import '../../features/payments/screens/payment_screen.dart';
import '../../features/payments/bloc/payment_bloc.dart';
import '../../features/payments/data/payment_api_repository.dart';
import '../../features/fleet/screens/fleet_dashboard_screen.dart';
import '../../features/fleet/screens/driver_dashboard_screen.dart';
import '../../features/fleet/bloc/fleet_bloc.dart';
import '../../features/fleet/data/repositories/fleet_repository.dart';
import '../../features/registration/screens/registration_screen.dart';
import '../../features/registration/bloc/registration_bloc.dart';
import '../../features/registration/data/repositories/client_auth_repository.dart';
import '../../features/policies/presentation/screens/policy_wallet_screen.dart';
import '../../features/policies/bloc/policy_wallet_bloc.dart';
import '../../features/policies/data/repositories/policy_repository.dart';
import '../../features/payments/screens/policy_confirmation_screen.dart';
import '../../features/onboarding/onboarding_screen.dart';
import '../../features/auth/screens/reset_password_screen.dart';
import '../../features/anonymous_session/data/repositories/anonymous_session_repository.dart';

/// Navigation extras for /fleet route
class FleetRouteArgs {
  const FleetRouteArgs({required this.userRole});

  /// e.g. 'driver', 'fleet_admin', 'broker_admin'
  final String userRole;
}

/// Navigation extras for /vehicles/scan route
class OcrWizardRouteArgs {
  const OcrWizardRouteArgs({
    required this.sessionToken,
    required this.onComplete,
    required this.onManualEntry,
  });

  final String sessionToken;
  final void Function(Map<String, OcrField> fields) onComplete;
  final void Function() onManualEntry;
}

/// Navigation extras for /vehicles/validate route
class VehicleValidateRouteArgs {
  const VehicleValidateRouteArgs({
    required this.vin,
    required this.licensePlate,
    this.sessionToken,
  });

  final String vin;
  final String licensePlate;
  final String? sessionToken;
}

/// Navigation extras for /auth-gate route
class AuthGateRouteArgs {
  const AuthGateRouteArgs({
    required this.redirectPath,
    this.redirectExtra,
  });

  final String redirectPath;
  final Object? redirectExtra;
}

const _storage = FlutterSecureStorage();

/// Routes accessible without authentication (anonymous users allowed).
const _publicRoutes = {
  '/login',
  '/registration',
  '/auth-gate',
  '/vehicles/scan',
  '/vehicles/validate',
  '/quotes/offers',
  '/onboarding',
  '/reset-password',
};

Future<void> _startAnonScan(
  BuildContext context,
  AnonymousSessionRepository repo,
) async {
  final sessionId = await repo.createSession();
  if (!context.mounted) return;
  context.push(
    '/vehicles/scan',
    extra: OcrWizardRouteArgs(
      sessionToken: sessionId,
      onComplete: (fields) {
        final vin = fields['vin']?.value ?? '';
        final plate = fields['license_plate']?.value ?? '';
        context.go(
          '/vehicles/validate',
          extra: VehicleValidateRouteArgs(
            vin: vin,
            licensePlate: plate,
            sessionToken: sessionId,
          ),
        );
      },
      onManualEntry: () => context.go(
        '/vehicles/validate',
        extra: VehicleValidateRouteArgs(
          vin: '',
          licensePlate: '',
          sessionToken: sessionId,
        ),
      ),
    ),
  );
}

class AppRouter {
  AppRouter._();

  static final GoRouter router = GoRouter(
    initialLocation: '/login',
    debugLogDiagnostics: false,
    redirect: (context, state) async {
      final location = state.matchedLocation;
      if (location == '/onboarding') return null;
      if (_publicRoutes.contains(location)) {
        if (location == '/login') {
          final box = Hive.box<dynamic>('onboarding');
          final seen = box.get('seen', defaultValue: false) as bool;
          if (!seen) return '/onboarding';
        }
        return null;
      }
      final token = await _storage.read(key: 'access_token');
      if (token == null || token.isEmpty) return '/login';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) {
          final redirect = state.extra is AuthRedirect
              ? state.extra as AuthRedirect
              : null;
          return BlocProvider(
            create: (_) => AuthBloc(
              dio: DioClient.instance,
              storage: _storage,
            ),
            child: LoginScreen(authRedirect: redirect),
          );
        },
      ),
      GoRoute(
        path: '/',
        builder: (context, state) {
          final policyRepo = context.read<PolicyRepository>();
          return BlocProvider(
            create: (_) => PolicyWalletBloc(policyRepository: policyRepo),
            child: const HomeScreen(),
          );
        },
      ),
      GoRoute(
        path: '/registration',
        builder: (context, state) {
          final redirect = state.extra is AuthRedirect
              ? state.extra as AuthRedirect
              : null;
          final repo = context.read<ClientAuthRepository>();
          return BlocProvider(
            create: (_) => RegistrationBloc(repository: repo),
            child: RegistrationScreen(authRedirect: redirect),
          );
        },
      ),
      GoRoute(
        path: '/auth-gate',
        builder: (context, state) {
          final args = state.extra is AuthGateRouteArgs
              ? state.extra as AuthGateRouteArgs
              : null;
          return AuthGateScreen(
            redirectPath: args?.redirectPath ?? '/',
            redirectExtra: args?.redirectExtra,
          );
        },
      ),
      GoRoute(
        path: '/vehicles/scan',
        builder: (context, state) {
          final args = state.extra as OcrWizardRouteArgs;
          final repo = context.read<OcrRepository>();
          return BlocProvider(
            create: (_) => OcrWizardBloc(repository: repo),
            child: OcrWizardScreen(
              sessionToken: args.sessionToken,
              onComplete: args.onComplete,
              onManualEntry: args.onManualEntry,
            ),
          );
        },
      ),
      GoRoute(
        path: '/vehicles/validate',
        builder: (context, state) {
          final args = state.extra as VehicleValidateRouteArgs;
          final repo = context.read<VehicleApiRepository>();
          return BlocProvider(
            create: (_) => VehicleValidationBloc(repository: repo),
            child: VehicleValidationScreen(
              vin: args.vin,
              licensePlate: args.licensePlate,
              sessionToken: args.sessionToken,
            ),
          );
        },
      ),
      GoRoute(
        path: '/quotes/offers',
        builder: (context, state) {
          final args = state.extra as QuoteOffersRouteArgs;
          final repo = context.read<QuoteApiRepository>();
          return BlocProvider(
            create: (_) => QuoteBloc(repository: repo),
            child: OffersScreen(sessionToken: args.sessionToken),
          );
        },
      ),
      GoRoute(
        path: '/policies',
        builder: (context, state) {
          final repo = context.read<PolicyRepository>();
          return BlocProvider(
            create: (_) => PolicyWalletBloc(policyRepository: repo),
            child: const PolicyWalletScreen(),
          );
        },
      ),
      GoRoute(
        path: '/fleet',
        builder: (context, state) {
          final args = state.extra as FleetRouteArgs?;
          final userRole = args?.userRole ?? 'fleet_admin';
          final repo = context.read<FleetRepository>();
          final bloc = FleetBloc(fleetRepository: repo);

          if (userRole == 'driver') {
            return BlocProvider(
              create: (_) => bloc,
              child: const DriverDashboardScreen(),
            );
          }
          return BlocProvider(
            create: (_) => bloc,
            child: const FleetDashboardScreen(),
          );
        },
      ),
      GoRoute(
        path: '/fleet/driver',
        builder: (context, state) {
          final repo = context.read<FleetRepository>();
          return BlocProvider(
            create: (_) => FleetBloc(fleetRepository: repo),
            child: const DriverDashboardScreen(),
          );
        },
      ),
      GoRoute(
        path: '/policy-confirmation',
        builder: (context, state) {
          final args = state.extra as PolicyConfirmationRouteArgs;
          return PolicyConfirmationScreen(
            insurerName: args.insurerName,
            amount: args.amount,
            currency: args.currency,
            paymentIntentId: args.paymentIntentId,
          );
        },
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) {
          final anonRepo = context.read<AnonymousSessionRepository>();
          return OnboardingScreen(
            onLogin: () => context.go('/login'),
            onRegister: () => context.go('/registration'),
            onAnonScan: () => _startAnonScan(context, anonRepo),
          );
        },
      ),
      GoRoute(
        path: '/reset-password',
        builder: (context, state) => const ResetPasswordScreen(),
      ),
      GoRoute(
        path: '/payment',
        builder: (context, state) {
          final args = state.extra as PaymentRouteArgs;
          final repo = context.read<PaymentApiRepository>();
          return BlocProvider(
            create: (_) => PaymentBloc(
              paymentRepo: repo,
              bearerToken: '',
            ),
            child: PaymentScreen(
              quoteId: args.quoteId,
              insurerName: args.insurerName,
              amount: args.amount,
              currency: args.currency,
            ),
          );
        },
      ),
    ],
  );
}
