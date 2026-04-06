import 'package:flutter/material.dart';
import '../../../features/auth/services/biometric_auth_service.dart';
import '../../../core/api/dio_client.dart';
import '../../compliance/data/cookie_consent_service.dart';
import '../../compliance/data/cookie_policy_service.dart';
import '../../compliance/presentation/widgets/cookie_consent_sheet.dart';

const _kBgColor = Color(0xFFE0EAF0);
const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.biometricService});

  final BiometricAuthService biometricService;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadBiometricState();
  }

  Future<void> _loadBiometricState() async {
    final available = await widget.biometricService.isAvailable();
    final enabled = await widget.biometricService.isEnabled();
    if (mounted) {
      setState(() {
        _biometricAvailable = available;
        _biometricEnabled = enabled;
        _loading = false;
      });
    }
  }

  Future<void> _toggleBiometric(bool value) async {
    try {
      if (value) {
        await widget.biometricService.enable();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Биометрията е активирана')),
          );
        }
      } else {
        await widget.biometricService.disable();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Биометрията е деактивирана')),
          );
        }
      }
      if (mounted) setState(() => _biometricEnabled = value);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Грешка при промяна на биометрията. Опитайте пак.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBgColor,
      appBar: AppBar(
        backgroundColor: _kDarkCard,
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Настройки',
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 18,
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildSectionHeader('Сигурност'),
                const SizedBox(height: 8),
                _buildBiometricTile(),
                const SizedBox(height: 20),
                _buildSectionHeader('Поверителност'),
                const SizedBox(height: 8),
                _buildCookieSettingsTile(),
              ],
            ),
    );
  }

  void _openCookieSettings() {
    showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      isScrollControlled: true,
      builder: (_) => CookieConsentSheet(
        cookieConsentService: CookieConsentService(dio: DioClient.instance),
        cookiePolicyService: CookiePolicyService(dio: DioClient.instance),
      ),
    );
  }

  Widget _buildSectionHeader(String title) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 4),
        child: Text(
          title,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: _kDarkCard.withAlpha(140),
            letterSpacing: 0.8,
          ),
        ),
      );

  Widget _buildCookieSettingsTile() => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(10),
              blurRadius: 12,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          leading: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: _kBlueMid.withAlpha(25),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.cookie_outlined,
                color: _kBlueMid, size: 22),
          ),
          title: const Text(
            'Настройки на бисквитките',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 15,
              color: _kDarkCard,
            ),
          ),
          subtitle: Text(
            'Управлявайте аналитични и маркетингови бисквитки',
            style: TextStyle(fontSize: 12, color: _kDarkCard.withAlpha(140)),
          ),
          trailing: const Icon(Icons.chevron_right, color: _kDarkCard),
          onTap: _openCookieSettings,
        ),
      );

  Widget _buildBiometricTile() => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(10),
              blurRadius: 12,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: SwitchListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          secondary: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: _kBlueMid.withAlpha(25),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.fingerprint, color: _kBlueMid, size: 22),
          ),
          title: const Text(
            'Бързо влизане',
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 15,
              color: _kDarkCard,
            ),
          ),
          subtitle: Text(
            _biometricAvailable
                ? 'Face ID или пръстов отпечатък'
                : 'Устройството не поддържа биометрия',
            style: TextStyle(
              fontSize: 12,
              color: _kDarkCard.withAlpha(140),
            ),
          ),
          value: _biometricEnabled,
          onChanged: _biometricAvailable ? _toggleBiometric : null,
          activeThumbColor: _kBlueMid,
          activeTrackColor: _kBlueMid.withAlpha(100),
        ),
      );
}
