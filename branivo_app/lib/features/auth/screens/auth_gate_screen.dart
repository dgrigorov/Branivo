import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

const _kBgColor = Color(0xFFE0EAF0);
const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);

/// Пренася redirect информация от auth gate → Login/Registration,
/// за да може потребителят да се върне към плащането след вход.
class AuthRedirect {
  const AuthRedirect({
    required this.path,
    this.extra,
    this.guestMode = false,
  });

  final String path;
  final Object? extra;
  final bool guestMode;
}

/// Показва се когато анонимен потребител натисне "Купи".
/// [redirectPath] и [redirectExtra] се подават от [OffersScreen],
/// за да се върне потребителят директно към плащането след успешен вход.
class AuthGateScreen extends StatelessWidget {
  const AuthGateScreen({
    super.key,
    required this.redirectPath,
    this.redirectExtra,
  });

  final String redirectPath;
  final Object? redirectExtra;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _kBgColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: BackButton(color: _kDarkCard),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              _buildHeader(context),
              const SizedBox(height: 48),
              _buildOption(
                context,
                icon: Icons.login_rounded,
                title: 'Имам акаунт',
                subtitle: 'Влез с имейл и парола',
                onTap: () => context.push(
                  '/login',
                  extra: AuthRedirect(
                    path: redirectPath,
                    extra: redirectExtra,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _buildOption(
                context,
                icon: Icons.person_add_alt_1_rounded,
                title: 'Нов съм тук',
                subtitle: 'Регистрирай се за 30 секунди',
                onTap: () => context.push(
                  '/registration',
                  extra: AuthRedirect(
                    path: redirectPath,
                    extra: redirectExtra,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _buildOption(
                context,
                icon: Icons.person_outline_rounded,
                title: 'Продължи като гост',
                subtitle: 'Без регистрация — само имейл за полицата',
                onTap: () => context.push(
                  '/registration',
                  extra: AuthRedirect(
                    path: redirectPath,
                    extra: redirectExtra,
                    guestMode: true,
                  ),
                ),
              ),
              const SizedBox(height: 40),
              Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text(
                  'Данните ти са защитени и криптирани.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _kDarkCard.withAlpha(120),
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: _kBlueMid.withAlpha(30),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(
            Icons.lock_open_rounded,
            color: _kBlueMid,
            size: 28,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Една стъпка преди плащане',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: _kDarkCard,
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        Text(
          'Нужен ни е акаунт, за да издадем полицата на твое име.',
          style: TextStyle(
            color: _kDarkCard.withAlpha(170),
            fontSize: 15,
            height: 1.4,
          ),
        ),
      ],
    );
  }

  Widget _buildOption(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: _kBlueMid.withAlpha(25),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: _kBlueMid, size: 22),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: _kDarkCard,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: _kDarkCard.withAlpha(140),
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: _kDarkCard.withAlpha(100),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
