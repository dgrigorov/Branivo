import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../ocr/data/repositories/ocr_models.dart';
import '../../quotes/screens/offers_screen.dart';
import '../bloc/vehicle_validation_bloc.dart';

// ─── Design tokens (consistent with OCR wizard) ────────────────────────────────
const _kBg = Color(0xFF0A0A0A);
const _kSurface = Color(0xFF1A1A2E);
const _kIndigo = Color(0xFF6366F1);
const _kGreen = Color(0xFF10B981);
const _kMuted = Color(0xFF64748B);
const _kTextSub = Color(0xFF94A3B8);

class VehicleValidationScreen extends StatefulWidget {
  const VehicleValidationScreen({
    super.key,
    required this.vin,
    required this.licensePlate,
    this.sessionToken,
    this.ocrFields,
  });

  final String vin;
  final String licensePlate;
  final String? sessionToken;
  final Map<String, OcrField>? ocrFields;

  @override
  State<VehicleValidationScreen> createState() =>
      _VehicleValidationScreenState();
}

class _VehicleValidationScreenState extends State<VehicleValidationScreen> {
  late final TextEditingController _vinCtrl;
  late final TextEditingController _plateCtrl;
  late final TextEditingController _makeCtrl;
  late final TextEditingController _modelCtrl;
  late final TextEditingController _yearCtrl;
  late final TextEditingController _colorCtrl;
  late final TextEditingController _fuelCtrl;
  late final TextEditingController _engineCtrl;
  late final TextEditingController _powerCtrl;
  late final TextEditingController _seatsCtrl;
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    final ocr = widget.ocrFields;
    _vinCtrl = TextEditingController(text: widget.vin);
    _plateCtrl = TextEditingController(text: widget.licensePlate);
    _makeCtrl = TextEditingController(text: ocr?['make']?.value ?? '');
    _modelCtrl = TextEditingController(text: ocr?['model']?.value ?? '');
    _yearCtrl = TextEditingController(text: ocr?['year']?.value ?? '');
    _colorCtrl = TextEditingController(text: ocr?['color']?.value ?? '');
    _fuelCtrl = TextEditingController(text: ocr?['fuel_type']?.value ?? '');
    _engineCtrl = TextEditingController(text: ocr?['engine_volume']?.value ?? '');
    _powerCtrl = TextEditingController(text: ocr?['power_kw']?.value ?? '');
    _seatsCtrl = TextEditingController(text: ocr?['seats']?.value ?? '');

    if (widget.vin.isNotEmpty && widget.licensePlate.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _triggerValidation();
      });
    }
  }

  @override
  void dispose() {
    for (final c in [
      _vinCtrl, _plateCtrl, _makeCtrl, _modelCtrl, _yearCtrl,
      _colorCtrl, _fuelCtrl, _engineCtrl, _powerCtrl, _seatsCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _triggerValidation() {
    context.read<VehicleValidationBloc>().add(
          ValidateVehicleEvent(
            vin: _vinCtrl.text.trim().toUpperCase(),
            licensePlate: _plateCtrl.text.trim().toUpperCase(),
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<VehicleValidationBloc, VehicleValidationState>(
      listener: (context, state) {
        if (state is VehicleValidationSuccess && state.result.canProceedToQuote) {
          final token = widget.sessionToken ?? '';
          context.push(
            '/quotes/offers',
            extra: QuoteOffersRouteArgs(sessionToken: token),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          backgroundColor: _kBg,
          appBar: AppBar(
            backgroundColor: _kBg,
            surfaceTintColor: Colors.transparent,
            title: const Text(
              'Въведи данните ръчно',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
            ),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: Colors.white),
              tooltip: 'Назад',
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/');
                }
              },
            ),
          ),
          body: Semantics(
            label: 'Статус на валидация',
            child: _buildBody(context, state),
          ),
        );
      },
    );
  }

  Widget _buildBody(BuildContext context, VehicleValidationState state) {
    if (state is VehicleValidationLoading) {
      return const Center(
        child: CircularProgressIndicator(color: _kIndigo),
      );
    }
    if (state is VehicleValidationGfBlocked) {
      return _GfBlockedView(
        reason: state.reason,
        onBack: () => context.pop(),
      );
    }
    if (state is VehicleValidationKatFallback) {
      return _KatFallbackView(
        message: state.message,
        onConfirm: () => context.read<VehicleValidationBloc>().add(
              KatManualConfirmEvent(
                vin: _vinCtrl.text.trim().toUpperCase(),
                licensePlate: _plateCtrl.text.trim().toUpperCase(),
              ),
            ),
      );
    }
    if (state is VehicleValidationSuccess) {
      return _SuccessView(state: state);
    }
    if (state is VehicleValidationError) {
      return _ErrorView(
        message: state.message,
        onRetry: () => context.read<VehicleValidationBloc>().add(
              const ValidationResetEvent(),
            ),
      );
    }
    return _buildForm(context);
  }

  Widget _buildForm(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SectionLabel(label: 'ЗАДЪЛЖИТЕЛНИ ПОЛЕТА', color: _kIndigo),
            const SizedBox(height: 10),
            _DarkField(
              controller: _vinCtrl,
              label: 'VIN номер (17 символа)',
              hint: 'напр. WBA3A5G51DNP26082',
              capitalization: TextCapitalization.characters,
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'VIN е задължителен';
                if (v.trim().length != 17) return 'VIN трябва да е точно 17 символа';
                return null;
              },
            ),
            const SizedBox(height: 12),
            _DarkField(
              controller: _plateCtrl,
              label: 'Регистрационен номер',
              hint: 'напр. СА1234АВ',
              capitalization: TextCapitalization.characters,
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Рег. номер е задължителен' : null,
            ),
            const SizedBox(height: 20),
            _SectionLabel(label: 'ДАННИ ЗА МПС (незадължителни)', color: _kMuted),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _DarkField(
                    controller: _makeCtrl,
                    label: 'Марка',
                    hint: 'напр. BMW',
                    capitalization: TextCapitalization.words,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DarkField(
                    controller: _modelCtrl,
                    label: 'Модел',
                    hint: 'напр. 320d',
                    capitalization: TextCapitalization.words,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _DarkField(
                    controller: _yearCtrl,
                    label: 'Година',
                    hint: 'напр. 2019',
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DarkField(
                    controller: _colorCtrl,
                    label: 'Цвят',
                    hint: 'напр. черен',
                    capitalization: TextCapitalization.words,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _DarkField(
                    controller: _fuelCtrl,
                    label: 'Гориво',
                    hint: 'напр. дизел',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DarkField(
                    controller: _seatsCtrl,
                    label: 'Брой места',
                    hint: 'напр. 5',
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _DarkField(
                    controller: _engineCtrl,
                    label: 'Обем (cc)',
                    hint: 'напр. 1995',
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DarkField(
                    controller: _powerCtrl,
                    label: 'Мощност (kW)',
                    hint: 'напр. 140',
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            SizedBox(
              height: 54,
              child: ElevatedButton(
                onPressed: () {
                  if (_formKey.currentState?.validate() == true) {
                    _triggerValidation();
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kIndigo,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: const Text(
                  'Валидирай МПС',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

// ─── Sub-views ─────────────────────────────────────────────────────────────────

class _GfBlockedView extends StatelessWidget {
  const _GfBlockedView({required this.reason, required this.onBack});
  final String reason;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.block_rounded, color: Colors.red, size: 48),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.withAlpha(20),
              border: Border.all(color: Colors.red.withAlpha(80)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              reason,
              style: const TextStyle(color: Colors.red, height: 1.5),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: onBack,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: Colors.white30),
            ),
            child: const Text('Назад'),
          ),
        ],
      ),
    );
  }
}

class _KatFallbackView extends StatelessWidget {
  const _KatFallbackView({required this.message, required this.onConfirm});
  final String message;
  final VoidCallback onConfirm;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 48),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(color: Colors.amber, height: 1.5),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onConfirm,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kIndigo,
                foregroundColor: Colors.white,
              ),
              child: const Text('Продължи'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.state});
  final VehicleValidationSuccess state;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle_rounded, color: _kGreen, size: 56),
          const SizedBox(height: 16),
          const Text(
            'МПС-то е валидирано!',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'КАТ: ${state.result.katStatus} · ГФ: ${state.result.gfStatus}',
            style: const TextStyle(color: _kTextSub, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline_rounded, color: Colors.red, size: 48),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(color: Colors.red, height: 1.5),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: onRetry,
            style: ElevatedButton.styleFrom(
              backgroundColor: _kIndigo,
              foregroundColor: Colors.white,
            ),
            child: const Text('Опитай отново'),
          ),
        ],
      ),
    );
  }
}

// ─── Reusable widgets ──────────────────────────────────────────────────────────

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        color: color,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1,
      ),
    );
  }
}

class _DarkField extends StatelessWidget {
  const _DarkField({
    required this.controller,
    required this.label,
    required this.hint,
    this.keyboardType = TextInputType.text,
    this.capitalization = TextCapitalization.none,
    this.validator,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final TextInputType keyboardType;
  final TextCapitalization capitalization;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      textCapitalization: capitalization,
      validator: validator,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: const TextStyle(color: _kMuted, fontSize: 13),
        hintStyle: const TextStyle(color: Color(0xFF374151), fontSize: 13),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF374151)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _kIndigo),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.red.shade400),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.red.shade400),
        ),
        filled: true,
        fillColor: _kSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
    );
  }
}
