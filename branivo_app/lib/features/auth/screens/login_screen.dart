import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../core/routing/app_router.dart';
import '../../../core/widgets/app_toast.dart';
import '../../../features/anonymous_session/data/repositories/anonymous_session_repository.dart';
import '../bloc/auth_bloc.dart';
import '../../../core/routing/auth_redirect.dart';

const _kBgColor = Color(0xFFE0EAF0);
const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);
const _kBlueLight = Color(0xFF6CC4F5);

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.authRedirect});

  /// If set, navigates to [authRedirect.path] after successful login
  /// instead of the default '/'.
  final AuthRedirect? authRedirect;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _startingAnonymous = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    context.read<AuthBloc>().add(
      LoginRequestedEvent(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      ),
    );
  }

  Future<void> _startAnonymousScan() async {
    if (_startingAnonymous) return;
    setState(() => _startingAnonymous = true);
    try {
      final repo = context.read<AnonymousSessionRepository>();
      final sessionToken = await repo.createSession();
      if (!mounted) return;
      context.push(
        '/vehicles/scan',
        extra: OcrWizardRouteArgs(
          sessionToken: sessionToken,
          onComplete: (fields) {
            final vin = fields['vin']?.value ?? '';
            final plate = fields['license_plate']?.value ?? '';
            context.go(
              '/vehicles/validate',
              extra: VehicleValidateRouteArgs(
                vin: vin,
                licensePlate: plate,
                sessionToken: sessionToken,
              ),
            );
          },
          onManualEntry: () {
            context.go(
              '/vehicles/validate',
              extra: VehicleValidateRouteArgs(
                vin: '',
                licensePlate: '',
                sessionToken: sessionToken,
              ),
            );
          },
        ),
      );
    } catch (_) {
      if (mounted) {
        AppToast.error(context, 'Грешка при стартиране. Опитайте пак.');
      }
    } finally {
      if (mounted) setState(() => _startingAnonymous = false);
    }
  }

  void _fillDemoCredentials() {
    _emailController.text = 'driver@branivo.bg';
    _passwordController.text = 'Driver1234!';
    _submit();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<AuthBloc, AuthState>(
      listener: _handleStateChange,
      child: Scaffold(
        backgroundColor: _kBgColor,
        body: SafeArea(child: _buildBody(context)),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, state) {
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildTopBar(context),
                const SizedBox(height: 40),
                _buildHeading(),
                const SizedBox(height: 24),
                _buildInfoCard(),
                const SizedBox(height: 24),
                if (state is AuthErrorState) _buildError(state.message),
                _buildFormCard(state),
                const SizedBox(height: 24),
                _buildAnonymousCta(),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTopBar(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      _CircleButton(
        icon: Icons.arrow_back_ios_new_rounded,
        onTap: () => Navigator.of(context).maybePop(),
      ),
      TextButton(
        onPressed: () => context.push('/registration'),
        child: const Text(
          'Регистрация',
          style: TextStyle(
            color: _kBlueMid,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
    ],
  );

  Widget _buildHeading() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Добре дошли!',
        style: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w800,
          color: _kDarkCard,
          height: 1.1,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        'Влезте в своя акаунт\nили създайте нов',
        style: TextStyle(
          fontSize: 15,
          color: _kDarkCard.withAlpha(140),
          height: 1.5,
        ),
      ),
    ],
  );

  Widget _buildInfoCard() => _DarkInfoCard(
    icon: Icons.lock_outline_rounded,
    title: 'Сигурно влизане',
    subtitle: 'Данните ви са защитени с\nкриптирана връзка',
  );

  Widget _buildError(String message) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    decoration: BoxDecoration(
      color: Colors.red.shade50,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Colors.red.shade200),
    ),
    child: Row(
      children: [
        Icon(Icons.error_outline_rounded, color: Colors.red.shade400, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: TextStyle(color: Colors.red.shade700, fontSize: 13),
          ),
        ),
      ],
    ),
  );

  Widget _buildFormCard(AuthState state) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withAlpha(15),
          blurRadius: 20,
          offset: const Offset(0, 4),
        ),
      ],
    ),
    child: Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _BranivoTextField(
            controller: _emailController,
            label: 'Имейл',
            icon: Icons.email_outlined,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            validator: (v) =>
                (v == null || v.isEmpty) ? 'Имейлът е задължителен' : null,
          ),
          const SizedBox(height: 12),
          _BranivoTextField(
            controller: _passwordController,
            label: 'Парола',
            icon: Icons.lock_outline_rounded,
            obscureText: _obscurePassword,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(),
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                color: Colors.grey,
                size: 20,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            validator: (v) =>
                (v == null || v.isEmpty) ? 'Паролата е задължителна' : null,
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => context.push('/reset-password'),
              child: const Text(
                'Забравена парола?',
                style: TextStyle(
                  color: _kBlueMid,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          _GradientButton(
            label: 'Влез',
            isLoading: state is AuthLoadingState,
            onPressed: _submit,
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.center,
            child: TextButton(
              onPressed: _fillDemoCredentials,
              child: const Text(
                'Demo credentials',
                style: TextStyle(
                  color: _kBlueMid,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );

  Widget _buildAnonymousCta() => Column(
    children: [
      Row(
        children: [
          const Expanded(child: Divider(color: Color(0xFFCBD5E1))),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'или',
              style: TextStyle(color: _kDarkCard.withAlpha(100), fontSize: 13),
            ),
          ),
          const Expanded(child: Divider(color: Color(0xFFCBD5E1))),
        ],
      ),
      const SizedBox(height: 16),
      SizedBox(
        width: double.infinity,
        height: 52,
        child: OutlinedButton.icon(
          onPressed: _startingAnonymous ? null : _startAnonymousScan,
          style: OutlinedButton.styleFrom(
            foregroundColor: _kBlueMid,
            side: const BorderSide(color: Color(0xFF3EA8E5), width: 1.5),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          icon: _startingAnonymous
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: _kBlueMid,
                  ),
                )
              : const Icon(Icons.document_scanner_outlined, size: 20),
          label: const Text(
            'Провери цени без акаунт',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Text(
        'Снимай талона → виж оферти → купи само ако искаш',
        style: TextStyle(
          color: _kDarkCard.withAlpha(100),
          fontSize: 12,
          height: 1.4,
        ),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 32),
    ],
  );

  void _handleStateChange(BuildContext context, AuthState state) {
    if (state is AuthRequires2FAState) {
      context.push('/2fa', extra: state.tempToken);
    } else if (state is AuthAuthenticatedState) {
      final redirect = widget.authRedirect;
      if (redirect != null) {
        context.go(redirect.path, extra: redirect.extra);
      } else {
        context.go('/');
      }
    }
  }
}

// ─── Shared widgets ────────────────────────────────────────────────────────

class _CircleButton extends StatelessWidget {
  const _CircleButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(20),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(icon, size: 16, color: _kDarkCard),
      ),
    );
  }
}

class _DarkInfoCard extends StatelessWidget {
  const _DarkInfoCard({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _kDarkCard,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white.withAlpha(38),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BranivoTextField extends StatelessWidget {
  const _BranivoTextField({
    required this.controller,
    required this.label,
    required this.icon,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.suffixIcon,
    this.onFieldSubmitted,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final Widget? suffixIcon;
  final void Function(String)? onFieldSubmitted;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      obscureText: obscureText,
      onFieldSubmitted: onFieldSubmitted,
      validator: validator,
      style: const TextStyle(fontSize: 15, color: _kDarkCard),
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20, color: _kBlueMid),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: const Color(0xFFF5F8FC),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _kBlueMid, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFEF9A9A)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFEF9A9A), width: 1.5),
        ),
        labelStyle: const TextStyle(color: Colors.grey, fontSize: 14),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
    );
  }
}

class _GradientButton extends StatelessWidget {
  const _GradientButton({
    required this.label,
    required this.isLoading,
    required this.onPressed,
  });

  final String label;
  final bool isLoading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [_kBlueLight, _kBlueMid],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: _kBlueMid.withAlpha(90),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: isLoading ? null : onPressed,
          child: Center(
            child: isLoading
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.3,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
