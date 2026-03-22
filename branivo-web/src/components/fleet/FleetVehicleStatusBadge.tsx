type FleetVehicleStatus = 'green' | 'yellow' | 'red';

interface Props {
  status: FleetVehicleStatus;
}

const STATUS_CONFIG: Record<
  FleetVehicleStatus,
  { icon: string; label: string; className: string }
> = {
  green: {
    icon: '✓',
    label: 'Активна',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  yellow: {
    icon: '⚠',
    label: 'Скоро изтича',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  red: {
    icon: '✕',
    label: 'Изтекла / Без полица',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

export function FleetVehicleStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${config.className}`}
      aria-label={config.label}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}
