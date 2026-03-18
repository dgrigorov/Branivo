import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'core/routing/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Hive.initFlutter();
  await Hive.openBox<dynamic>('policies');
  await Hive.openBox<dynamic>('tenant_theme');

  runApp(const BranivoApp());
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
