'use client';

const REVIEWS = [
  {
    id: '1',
    name: 'Nikolay N.',
    text: 'Страхотни и бърз отговор! Препоръчвам на всеки.',
  },
  {
    id: '2',
    name: 'Иван Б.',
    text: 'Склонихме комбинирана застраховка само за 5 минути. Отличен сервиз!',
  },
  {
    id: '3',
    name: 'Мария С.',
    text: 'Намерих най-ниска цена за колата ми. Бърза и лесна услуга.',
  },
] as const;

function Stars() {
  return (
    <div aria-label="5 звезди" className="flex text-yellow-400">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden="true">★</span>)}
    </div>
  );
}

export function SocialProofSidebar() {
  return (
    <div className="space-y-3">
      {/* Rating card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            G
          </div>
          <div>
            <div className="text-lg font-bold leading-none">4.9</div>
            <Stars />
          </div>
        </div>
        <p className="mt-2 text-sm font-semibold text-gray-700">50 000+ клиенти избраха Branivo</p>
      </div>

      {/* Review cards */}
      {REVIEWS.map((review) => (
        <div key={review.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
              {review.name[0]}
            </div>
            <span className="text-sm font-semibold text-gray-800">{review.name}</span>
          </div>
          <Stars />
          <p className="mt-1.5 text-xs text-gray-600">&ldquo;{review.text}&rdquo;</p>
        </div>
      ))}
    </div>
  );
}
