import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';

const _storage = FlutterSecureStorage();

String? _decodeRole(String token) {
  try {
    final parts = token.split('.');
    if (parts.length < 2) return null;
    final payload = utf8.decode(
      base64Url.decode(base64Url.normalize(parts[1])),
    );
    final map = jsonDecode(payload) as Map<String, dynamic>;
    return map['role'] as String?;
  } catch (_) {
    return null;
  }
}

bool _hasFleetAccess(String? role) =>
    role == 'driver' ||
    role == 'fleet_admin' ||
    role == 'broker_admin' ||
    role == 'broker_agent';

class AppDrawer extends StatefulWidget {
  const AppDrawer({super.key});

  @override
  State<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends State<AppDrawer> {
  String? _role;

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  Future<void> _loadRole() async {
    final token = await _storage.read(key: 'access_token');
    if (token != null && mounted) {
      setState(() => _role = _decodeRole(token));
    }
  }

  Future<void> _logout() async {
    await _storage.deleteAll();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final currentLocation =
        GoRouterState.of(context).matchedLocation;

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            DrawerHeader(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
              ),
              child: Align(
                alignment: Alignment.bottomLeft,
                child: Text(
                  'Branivo',
                  style: Theme.of(context)
                      .textTheme
                      .headlineSmall
                      ?.copyWith(color: Colors.white),
                ),
              ),
            ),
            _DrawerItem(
              icon: Icons.directions_car,
              label: 'МПС-та',
              route: '/vehicles',
              currentLocation: currentLocation,
            ),
            _DrawerItem(
              icon: Icons.policy,
              label: 'Полици',
              route: '/policies',
              currentLocation: currentLocation,
            ),
            if (_hasFleetAccess(_role))
              _DrawerItem(
                icon: Icons.local_shipping,
                label: 'Флот',
                route: '/fleet',
                currentLocation: currentLocation,
              ),
            const Spacer(),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.red),
              title: const Text(
                'Изход',
                style: TextStyle(color: Colors.red),
              ),
              onTap: _logout,
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.route,
    required this.currentLocation,
  });

  final IconData icon;
  final String label;
  final String route;
  final String currentLocation;

  @override
  Widget build(BuildContext context) {
    final isActive = currentLocation == route ||
        currentLocation.startsWith('$route/');

    return ListTile(
      selected: isActive,
      leading: Icon(icon),
      title: Text(label),
      onTap: () {
        Navigator.of(context).pop();
        if (!isActive) context.go(route);
      },
    );
  }
}
