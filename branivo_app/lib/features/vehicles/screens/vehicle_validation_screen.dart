import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../quotes/screens/offers_screen.dart';
import '../bloc/vehicle_validation_bloc.dart';

class VehicleValidationScreen extends StatefulWidget {
  const VehicleValidationScreen({
    super.key,
    required this.vin,
    required this.licensePlate,
    this.sessionToken,
  });

  final String vin;
  final String licensePlate;
  final String? sessionToken;

  @override
  State<VehicleValidationScreen> createState() =>
      _VehicleValidationScreenState();
}

class _VehicleValidationScreenState extends State<VehicleValidationScreen> {
  late final TextEditingController _vinCtrl;
  late final TextEditingController _plateCtrl;
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    _vinCtrl = TextEditingController(text: widget.vin);
    _plateCtrl = TextEditingController(text: widget.licensePlate);

    // Auto-trigger validation if both values are provided from OCR
    if (widget.vin.isNotEmpty && widget.licensePlate.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _triggerValidation();
      });
    }
  }

  @override
  void dispose() {
    _vinCtrl.dispose();
    _plateCtrl.dispose();
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
          appBar: AppBar(
            title: const Text('Валидация на МПС'),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              tooltip: 'Назад',
              onPressed: () => context.go('/'),
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
      return const Center(child: CircularProgressIndicator());
    }
    if (state is VehicleValidationGfBlocked) {
      return _buildGfBlockedView(context, state.reason);
    }
    if (state is VehicleValidationKatFallback) {
      return _buildKatFallbackView(context, state.message);
    }
    if (state is VehicleValidationSuccess) {
      return _buildSuccessView(state);
    }
    if (state is VehicleValidationError) {
      return _buildErrorView(context, state.message);
    }
    // Initial state — show manual entry form
    return _buildManualEntryForm(context);
  }

  Widget _buildManualEntryForm(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Въведете данни за МПС-то',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 24),
            TextFormField(
              controller: _vinCtrl,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'VIN номер (17 символа)',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) return 'VIN е задължителен';
                if (v.trim().length != 17) return 'VIN трябва да е 17 символа';
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _plateCtrl,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Регистрационен номер',
                border: OutlineInputBorder(),
              ),
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Рег. номер е задължителен' : null,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                if (_formKey.currentState?.validate() == true) {
                  _triggerValidation();
                }
              },
              child: const Text('Валидирай МПС'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGfBlockedView(BuildContext context, String reason) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              border: Border.all(color: Colors.red),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              reason,
              style: TextStyle(color: Colors.red.shade900),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => context.go('/'),
            child: const Text('Назад'),
          ),
        ],
      ),
    );
  }

  Widget _buildKatFallbackView(BuildContext context, String message) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(message, style: const TextStyle(color: Colors.orange)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () {
              context.read<VehicleValidationBloc>().add(
                    KatManualConfirmEvent(
                      vin: _vinCtrl.text.trim().toUpperCase(),
                      licensePlate: _plateCtrl.text.trim().toUpperCase(),
                    ),
                  );
            },
            child: const Text('Продължи'),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessView(VehicleValidationSuccess state) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 48),
          const SizedBox(height: 8),
          Text('КАТ: ${state.result.katStatus}'),
          Text('Гаранционен фонд: ${state.result.gfStatus}'),
          if (state.result.canProceedToQuote) ...[
            const SizedBox(height: 16),
            const Text(
              'МПС-то е валидирано успешно!',
              style: TextStyle(fontSize: 16, color: Colors.green),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildErrorView(BuildContext context, String message) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(message, style: const TextStyle(color: Colors.red)),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              context.read<VehicleValidationBloc>().add(
                    const ValidationResetEvent(),
                  );
            },
            child: const Text('Опитай отново'),
          ),
        ],
      ),
    );
  }
}
