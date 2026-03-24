import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/auth_bloc.dart';

const _kBgColor = Color(0xFFE0EAF0);
const _kDarkCard = Color(0xFF1A2D3A);
const _kBlueMid = Color(0xFF3EA8E5);
const _kBlueLight = Color(0xFF6CC4F5);

class TwoFAScreen extends StatefulWidget {
  const TwoFAScreen({super.key, required this.tempToken});

  final String tempToken;

  @override
  State<TwoFAScreen> createState() => _TwoFAScreenState();
}

class _TwoFAScreenState extends State<TwoFAScreen> {
  final _codeController = TextEditingController();
  final _focusNode = FocusNode();

  String get _code => _codeController.text;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(() => setState(() {}));
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _focusNode.requestFocus());
  }

  @override
  void dispose() {
    _codeController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _submit() {
    if (_code.length != 6) return;
    context.read<AuthBloc>().add(
          TwoFAVerifyRequestedEvent(
            tempToken: widget.tempToken,
            otpCode: _code,
          ),
        );
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
        return GestureDetector(
          onTap: () => _focusNode.requestFocus(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildTopBar(context),
                const SizedBox(height: 40),
                _buildHeading(),
                const SizedBox(height: 24),
                _buildInfoCard(),
                const SizedBox(height: 32),
                if (state is AuthErrorState) _buildError(state.message),
                _buildOtpBoxes(),
                _buildHiddenInput(),
                const SizedBox(height: 32),
                _GradientButton(
                  label: 'Провери',
                  isLoading: state is AuthLoadingState,
                  enabled: _code.length == 6,
                  onPressed: _submit,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildTopBar(BuildContext context) => Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
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
              child: const Icon(
                Icons.arrow_back_ios_new_rounded,
                size: 16,
                color: _kDarkCard,
              ),
            ),
          ),
        ],
      );

  Widget _buildHeading() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Верификация',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: _kDarkCard,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Въведете 6-цифрения код\nот вашия authenticator',
            style: TextStyle(
              fontSize: 15,
              color: _kDarkCard.withAlpha(140),
              height: 1.5,
            ),
          ),
        ],
      );

  Widget _buildInfoCard() => Container(
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
              child: const Icon(
                Icons.verified_user_outlined,
                color: Colors.white,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Двустепенна верификация',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Отворете вашия authenticator\nи въведете показания код',
                    style: TextStyle(
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

  Widget _buildError(String message) => Container(
        margin: const EdgeInsets.only(bottom: 20),
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

  Widget _buildOtpBoxes() => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(6, (i) {
          final char = i < _code.length ? _code[i] : '';
          final isActive = i == _code.length;
          return _OtpBox(digit: char, isActive: isActive);
        }),
      );

  Widget _buildHiddenInput() => SizedBox(
        height: 0,
        child: TextFormField(
          controller: _codeController,
          focusNode: _focusNode,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          onFieldSubmitted: (_) => _submit(),
          decoration: const InputDecoration(border: InputBorder.none),
          style: const TextStyle(fontSize: 1, color: Colors.transparent),
          cursorColor: Colors.transparent,
        ),
      );

  void _handleStateChange(BuildContext context, AuthState state) {
    if (state is AuthAuthenticatedState) {
      Navigator.of(context).pushReplacementNamed('/dashboard');
    }
  }
}

// ─── OTP digit box ─────────────────────────────────────────────────────────

class _OtpBox extends StatelessWidget {
  const _OtpBox({required this.digit, required this.isActive});

  final String digit;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 48,
      height: 56,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isActive
              ? _kBlueMid
              : digit.isNotEmpty
                  ? _kBlueMid.withAlpha(100)
                  : Colors.transparent,
          width: isActive ? 2 : 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(15),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Center(
        child: digit.isNotEmpty
            ? Text(
                digit,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: _kDarkCard,
                ),
              )
            : isActive
                ? Container(
                    width: 2,
                    height: 24,
                    color: _kBlueMid,
                  )
                : null,
      ),
    );
  }
}

// ─── Gradient button ───────────────────────────────────────────────────────

class _GradientButton extends StatelessWidget {
  const _GradientButton({
    required this.label,
    required this.isLoading,
    required this.enabled,
    required this.onPressed,
  });

  final String label;
  final bool isLoading;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: (!isLoading && enabled) ? 1.0 : 0.5,
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [_kBlueLight, _kBlueMid],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: (!isLoading && enabled)
              ? [
                  BoxShadow(
                    color: _kBlueMid.withAlpha(90),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : [],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: (!isLoading && enabled) ? onPressed : null,
            child: Center(
              child: isLoading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.5, color: Colors.white),
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
      ),
    );
  }
}
