// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'policy_document.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class PolicyDocumentAdapter extends TypeAdapter<PolicyDocument> {
  @override
  final int typeId = 10;

  @override
  PolicyDocument read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return PolicyDocument(
      policyId: fields[0] as String,
      policyNumber: fields[1] as String,
      status: fields[2] as String,
      coverageStartDate: fields[3] as DateTime?,
      coverageEndDate: fields[4] as DateTime?,
      premiumAmount: fields[5] as double,
      currency: fields[6] as String,
      cachedAt: fields[7] as DateTime,
    );
  }

  @override
  void write(BinaryWriter writer, PolicyDocument obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.policyId)
      ..writeByte(1)
      ..write(obj.policyNumber)
      ..writeByte(2)
      ..write(obj.status)
      ..writeByte(3)
      ..write(obj.coverageStartDate)
      ..writeByte(4)
      ..write(obj.coverageEndDate)
      ..writeByte(5)
      ..write(obj.premiumAmount)
      ..writeByte(6)
      ..write(obj.currency)
      ..writeByte(7)
      ..write(obj.cachedAt);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is PolicyDocumentAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
