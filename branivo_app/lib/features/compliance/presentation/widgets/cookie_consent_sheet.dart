import 'package:flutter/material.dart';
import '../../data/cookie_consent_service.dart';
import '../../data/cookie_policy_service.dart';
import '../screens/cookie_policy_screen.dart';

class CookieConsentSheet extends StatefulWidget {
  const CookieConsentSheet({
    super.key,
    required this.cookieConsentService,
    required this.cookiePolicyService,
  });

  final CookieConsentService cookieConsentService;
  final CookiePolicyService cookiePolicyService;

  @override
  State<CookieConsentSheet> createState() => _CookieConsentSheetState();
}

class _CookieConsentSheetState extends State<CookieConsentSheet> {
  bool _analytics = false;
  bool _marketing = false;
  bool _functional = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadCurrentConsent();
  }

  void _loadCurrentConsent() {
    final current = widget.cookieConsentService.getCurrentConsent();
    setState(() {
      _analytics = current['analytics'] as bool? ?? false;
      _marketing = current['marketing'] as bool? ?? false;
      _functional = current['functional'] as bool? ?? false;
    });
  }

  Future<void> _save({required bool acceptAll}) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      await widget.cookieConsentService.saveConsent(
        analytics: acceptAll ? true : _analytics,
        marketing: acceptAll ? true : _marketing,
        functional: acceptAll ? true : _functional,
      );
    } finally {
      if (mounted) {
        Navigator.of(context).pop();
      }
    }
  }

  void _openCookiePolicy() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CookiePolicyScreen(
          cookiePolicyService: widget.cookiePolicyService,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Настройки на бисквитките',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 12),
              Text(
                'Използваме бисквитки, за да подобряваме услугата си и да Ви предлагаме '
                'персонализирано съдържание. Можете да управлявате предпочитанията си по-долу. '
                'Необходимите бисквитки винаги са активни.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 4),
              GestureDetector(
                onTap: _openCookiePolicy,
                child: Text(
                  'Cookie Policy',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                    decoration: TextDecoration.underline,
                    fontSize: 13,
                  ),
                ),
              ),
              const Divider(height: 24),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'Необходими',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: const Text('Необходими за работата на приложението'),
                value: true,
                onChanged: null,
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'Аналитични',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle:
                    const Text('Помагат ни да подобряваме приложението'),
                value: _analytics,
                onChanged: (val) => setState(() => _analytics = val),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'Маркетингови',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: const Text('Персонализирани предложения и новини'),
                value: _marketing,
                onChanged: (val) => setState(() => _marketing = val),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'Функционални',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: const Text('Запомняне на предпочитания'),
                value: _functional,
                onChanged: (val) => setState(() => _functional = val),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : () => _save(acceptAll: true),
                  child: const Text('Приеми всички'),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _saving ? null : () => _save(acceptAll: false),
                  child: const Text('Запази избора ми'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
