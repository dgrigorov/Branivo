import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/ocr/data/repositories/ocr_api_repository.dart';
import 'features/vehicles/data/repositories/vehicle_api_repository.dart';
import 'features/vehicles/data/repositories/vehicles_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Hive.initFlutter();
  await Hive.openBox<dynamic>('policies');
  await Hive.openBox<dynamic>('tenant_theme');

  const storage = FlutterSecureStorage();
  final dio = Dio();

  final vehiclesRepository = VehiclesRepository(dio: dio, storage: storage);
  final vehicleApiRepository = VehicleApiRepository(dio: dio, storage: storage);
  final ocrApiRepository = OcrApiRepository(dio: dio);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<VehiclesRepository>.value(value: vehiclesRepository),
        RepositoryProvider<VehicleApiRepository>.value(
            value: vehicleApiRepository),
        RepositoryProvider<OcrApiRepository>.value(value: ocrApiRepository),
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
