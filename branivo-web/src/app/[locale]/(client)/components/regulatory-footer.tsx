interface RegulatoryFooterProps {
  kfnLicense: string | null;
  einCode: string | null;
  legalName: string | null;
}

export function RegulatoryFooter({
  kfnLicense,
  einCode,
  legalName,
}: RegulatoryFooterProps) {
  if (!kfnLicense && !einCode) return null;

  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-50 py-3 px-4">
      <p className="text-center text-xs text-gray-500">
        {legalName && <span className="font-medium">{legalName}</span>}
        {legalName && (kfnLicense || einCode) && ' · '}
        {kfnLicense && (
          <span>Лицензиран застрахователен брокер · КФН Лиценз: {kfnLicense}</span>
        )}
        {kfnLicense && einCode && ' · '}
        {einCode && <span>ЕИК: {einCode}</span>}
      </p>
    </footer>
  );
}
