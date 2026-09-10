export type TeltonikaIoValue = number | string;

export type TeltonikaGpsElement = {
  longitude: number;
  latitude: number;
  altitudeMeters: number;
  angleDegrees: number;
  satellites: number;
  speedKph: number;
};

export type TeltonikaCodec8ERecord = {
  timestampMs: number;
  priority: number;
  gps: TeltonikaGpsElement;
  eventIoId: number;
  io: Record<number, TeltonikaIoValue>;
};

export type TeltonikaCodec8EPacket = {
  codecId: 0x8e;
  recordCount: number;
  records: TeltonikaCodec8ERecord[];
  crc16: number;
  acknowledgement: Buffer;
};

export class TeltonikaProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeltonikaProtocolError";
  }
}

class Cursor {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  get position() { return this.offset; }
  get remaining() { return this.buffer.length - this.offset; }

  private require(bytes: number) {
    if (bytes < 0 || this.offset + bytes > this.buffer.length) {
      throw new TeltonikaProtocolError("Codec 8E packet ended before the declared record was complete.");
    }
  }

  u8() {
    this.require(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16() {
    this.require(2);
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  i16() {
    this.require(2);
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    this.require(4);
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  i32() {
    this.require(4);
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  u64() {
    this.require(8);
    const value = this.buffer.readBigUInt64BE(this.offset);
    this.offset += 8;
    return value;
  }

  bytes(length: number) {
    this.require(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

export function crc16Ibm(buffer: Uint8Array) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

export function parseTeltonikaImeiHandshake(buffer: Buffer) {
  if (buffer.length < 3) throw new TeltonikaProtocolError("IMEI handshake is incomplete.");
  const declaredLength = buffer.readUInt16BE(0);
  if (declaredLength < 14 || declaredLength > 20) throw new TeltonikaProtocolError("IMEI length is outside the supported range.");
  if (buffer.length !== declaredLength + 2) throw new TeltonikaProtocolError("IMEI handshake length does not match its prefix.");
  const imei = buffer.subarray(2).toString("ascii");
  if (!/^\d{14,20}$/.test(imei)) throw new TeltonikaProtocolError("IMEI handshake contains invalid characters.");
  return imei;
}

export function teltonikaImeiResponse(accepted: boolean) {
  return Buffer.from([accepted ? 0x01 : 0x00]);
}

export function teltonikaRecordAcknowledgement(recordCount: number) {
  if (!Number.isInteger(recordCount) || recordCount < 0 || recordCount > 0xffffffff) {
    throw new TeltonikaProtocolError("Record acknowledgement count is invalid.");
  }
  const response = Buffer.alloc(4);
  response.writeUInt32BE(recordCount, 0);
  return response;
}

function jsonSafeEightByteValue(value: bigint): TeltonikaIoValue {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString(10);
}

function parseIoElements(cursor: Cursor) {
  const eventIoId = cursor.u16();
  const declaredTotal = cursor.u16();
  const io: Record<number, TeltonikaIoValue> = {};
  let parsedTotal = 0;

  const parseFixed = (bytes: 1 | 2 | 4 | 8) => {
    const count = cursor.u16();
    for (let index = 0; index < count; index += 1) {
      const id = cursor.u16();
      let value: TeltonikaIoValue;
      if (bytes === 1) value = cursor.u8();
      else if (bytes === 2) value = cursor.u16();
      else if (bytes === 4) value = cursor.u32();
      else value = jsonSafeEightByteValue(cursor.u64());
      io[id] = value;
      parsedTotal += 1;
    }
  };

  parseFixed(1);
  parseFixed(2);
  parseFixed(4);
  parseFixed(8);

  const variableCount = cursor.u16();
  for (let index = 0; index < variableCount; index += 1) {
    const id = cursor.u16();
    const length = cursor.u16();
    io[id] = cursor.bytes(length).toString("hex");
    parsedTotal += 1;
  }

  if (parsedTotal !== declaredTotal) {
    throw new TeltonikaProtocolError(`Codec 8E IO count mismatch: declared ${declaredTotal}, parsed ${parsedTotal}.`);
  }

  return { eventIoId, io };
}

function parseRecord(cursor: Cursor): TeltonikaCodec8ERecord {
  const timestamp = cursor.u64();
  if (timestamp > BigInt(Number.MAX_SAFE_INTEGER)) throw new TeltonikaProtocolError("Tracker timestamp is outside JavaScript's safe integer range.");
  const priority = cursor.u8();
  const longitude = cursor.i32() / 10_000_000;
  const latitude = cursor.i32() / 10_000_000;
  const altitudeMeters = cursor.i16();
  const angleDegrees = cursor.u16();
  const satellites = cursor.u8();
  const speedKph = cursor.u16();
  const { eventIoId, io } = parseIoElements(cursor);

  return {
    timestampMs: Number(timestamp),
    priority,
    gps: { longitude, latitude, altitudeMeters, angleDegrees, satellites, speedKph },
    eventIoId,
    io,
  };
}

export function decodeTeltonikaCodec8E(packet: Buffer): TeltonikaCodec8EPacket {
  if (packet.length < 13) throw new TeltonikaProtocolError("Codec 8E packet is too short.");
  if (packet.readUInt32BE(0) !== 0) throw new TeltonikaProtocolError("Codec 8E packet preamble must be four zero bytes.");

  const dataLength = packet.readUInt32BE(4);
  const expectedLength = 8 + dataLength + 4;
  if (packet.length !== expectedLength) {
    throw new TeltonikaProtocolError(`Codec 8E data length mismatch: expected ${expectedLength} bytes, received ${packet.length}.`);
  }

  const data = packet.subarray(8, 8 + dataLength);
  const suppliedCrc = packet.readUInt32BE(8 + dataLength);
  const calculatedCrc = crc16Ibm(data);
  if (suppliedCrc !== calculatedCrc) {
    throw new TeltonikaProtocolError(`Codec 8E CRC mismatch: expected 0x${calculatedCrc.toString(16)}, received 0x${suppliedCrc.toString(16)}.`);
  }

  const cursor = new Cursor(data);
  const codecId = cursor.u8();
  if (codecId !== 0x8e) throw new TeltonikaProtocolError(`Unsupported Teltonika codec 0x${codecId.toString(16)}; Codec 8 Extended (0x8E) is required.`);

  const firstCount = cursor.u8();
  if (firstCount === 0) throw new TeltonikaProtocolError("Codec 8E packet contains no AVL records.");
  const records: TeltonikaCodec8ERecord[] = [];
  for (let index = 0; index < firstCount; index += 1) records.push(parseRecord(cursor));
  const secondCount = cursor.u8();
  if (secondCount !== firstCount) {
    throw new TeltonikaProtocolError(`Codec 8E record count mismatch: first=${firstCount}, second=${secondCount}.`);
  }
  if (cursor.remaining !== 0) throw new TeltonikaProtocolError(`Codec 8E packet has ${cursor.remaining} unexpected data byte(s).`);

  return {
    codecId: 0x8e,
    recordCount: firstCount,
    records,
    crc16: calculatedCrc,
    acknowledgement: teltonikaRecordAcknowledgement(firstCount),
  };
}
