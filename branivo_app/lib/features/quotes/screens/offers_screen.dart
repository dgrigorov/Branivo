import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../bloc/quote_bloc.dart';
import '../bloc/quote_state.dart';
import '../data/quote_api_repository.dart';
import '../widgets/offer_card.dart';

class QuoteOffersRouteArgs {
  const QuoteOffersRouteArgs({required this.sessionToken});

  final String sessionToken;
}

class OffersScreen extends StatelessWidget {
  const OffersScreen({super.key, required this.sessionToken});

  final String sessionToken;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Оферти за застраховка'),
      ),
      body: BlocBuilder<QuoteBloc, QuoteState>(
        builder: (context, state) {
          if (state is QuoteInitialState || state is QuoteLoadingState) {
            return _buildSkeleton();
          }

          if (state is QuotePartialState) {
            return _buildOfferList(state.offers);
          }

          if (state is QuoteLoadedState) {
            if (state.offers.isEmpty) {
              return const Center(
                child: Text('Няма налични оферти в момента.'),
              );
            }
            return _buildOfferList(state.offers);
          }

          if (state is QuoteErrorState) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Грешка при зареждане на оферти: ${state.message}',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          return const SizedBox.shrink();
        },
      ),
    );
  }

  Widget _buildSkeleton() {
    return ListView.builder(
      itemCount: 4,
      itemBuilder: (context, index) => const OfferCardSkeleton(),
    );
  }

  Widget _buildOfferList(List<QuoteOffer> offers) {
    return ListView.builder(
      itemCount: offers.length,
      itemBuilder: (context, i) {
        final offer = offers[i];
        return Semantics(
          label: offer.isRecommended
              ? 'Препоръчана оферта от ${offer.insurerName}'
              : 'Оферта от ${offer.insurerName}',
          child: OfferCard(
            offer: offer,
            isRecommended: offer.isRecommended,
          ),
        );
      },
    );
  }
}
