import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/screens/login_screen.dart';
import '../../features/ocr/screens/ocr_wizard_screen.dart';
import '../../features/ocr/bloc/ocr_wizard_bloc.dart';
import '../../features/ocr/data/repositories/ocr_api_repository.dart';
import '../../features/ocr/data/repositories/ocr_models.dart';
import '../../features/vehicles/screens/vehicle_list_screen.dart';
import '../../features/vehicles/screens/vehicle_validation_screen.dart';
import '../../features/vehicles/bloc/vehicles_bloc.dart';
import '../../features/vehicles/bloc/vehicle_validation_bloc.dart';
import '../../features/vehicles/data/repositories/vehicles_repository.dart';
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
  });

  final String vin;
  final String licensePlate;
}

class AppRouter {
  AppRouter._();

  static final GoRouter router = GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) {
          final repo = context.read<VehiclesRepository>();
          return BlocProvider(
            create: (_) => VehiclesBloc(repository: repo),
            child: const VehicleListScreen(),
          );
        },
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/vehicles',
        builder: (context, state) {
          final repo = context.read<VehiclesRepository>();
          return BlocProvider(
            create: (_) => VehiclesBloc(repository: repo),
            child: const VehicleListScreen(),
          );
        },
      ),
      GoRoute(
        path: '/vehicles/scan',
        builder: (context, state) {
          final args = state.extra as OcrWizardRouteArgs;
          final repo = context.read<OcrApiRepository>();
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
        path: '/payment',
        builder: (context, state) {
          final args = state.extra as PaymentRouteArgs;
          final repo = context.read<PaymentApiRepository>();
          // bearerToken се взима от storage в реален сценарий
          // За сега се предава чрез PaymentRouteArgs (или storage)
          return BlocProvider(
            create: (_) => PaymentBloc(
              paymentRepo: repo,
              bearerToken: '', // TODO: inject from secure storage
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
