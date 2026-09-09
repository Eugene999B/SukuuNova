import { describe, expect, it } from "vitest";
import {
  crc16Ibm,
  decodeTeltonikaCodec8E,
  parseTeltonikaImeiHandshake,
  teltonikaImeiResponse,
  teltonikaRecordAcknowledgement,
} from "../src/lib/novacore/teltonika-codec8e";

const OFFICIAL_CODEC8E_EXAMPLE = "000000000000004A8E010000016B412CEE000100000000000000000000000000000000010005000100010100010011001D00010010015E2C880002000B000000003544C87A000E000000001DD7E06A00000100002994";

describe("Teltonika Codec 8 Extended", () => {
  it("parses the manufacturer example and produces the correct AVL acknowledgement", () => {
    const parsed = decodeTeltonikaCodec8E(Buffer.from(OFFICIAL_CODEC8E_EXAMPLE, "hex"));
    expect(parsed.codecId).toBe(0x8e);
    expect(parsed.recordCount).toBe(1);
    expect(parsed.crc16).toBe(0x2994);
    expect(parsed.acknowledgement.toString("hex")).toBe("00000001");
    expect(parsed.records[0]).toMatchObject({
      timestampMs: 1560161082880,
      priority: 1,
      eventIoId: 1,
      gps: {
        longitude: 0,
        latitude: 0,
        altitudeMeters: 0,
        angleDegrees: 0,
        satellites: 0,
        speedKph: 0,
      },
    });
    expect(parsed.records[0].io[1]).toBe(1);
    expect(parsed.records[0].io[17]).toBe(29);
    expect(parsed.records[0].io[16]).toBe(22_949_000);
    expect(parsed.records[0].io[11]).toBe(893_700_218);
    expect(parsed.records[0].io[14]).toBe(500_686_954);
  });

  it("verifies CRC-16/IBM over the Teltonika data field", () => {
    const packet = Buffer.from(OFFICIAL_CODEC8E_EXAMPLE, "hex");
    const length = packet.readUInt32BE(4);
    expect(crc16Ibm(packet.subarray(8, 8 + length))).toBe(0x2994);
  });

  it("parses IMEI handshake and emits binary accept/reject responses", () => {
    const imei = "356307042441013";
    const handshake = Buffer.concat([Buffer.from([0x00, imei.length]), Buffer.from(imei, "ascii")]);
    expect(parseTeltonikaImeiHandshake(handshake)).toBe(imei);
    expect(teltonikaImeiResponse(true).toString("hex")).toBe("01");
    expect(teltonikaImeiResponse(false).toString("hex")).toBe("00");
  });

  it("rejects packets whose CRC has been modified", () => {
    const packet = Buffer.from(OFFICIAL_CODEC8E_EXAMPLE, "hex");
    packet[packet.length - 1] ^= 0xff;
    expect(() => decodeTeltonikaCodec8E(packet)).toThrow(/CRC mismatch/);
  });

  it("rejects mismatched AVL record counts", () => {
    const packet = Buffer.from(OFFICIAL_CODEC8E_EXAMPLE, "hex");
    const dataLength = packet.readUInt32BE(4);
    packet[8 + dataLength - 1] = 2;
    const crc = crc16Ibm(packet.subarray(8, 8 + dataLength));
    packet.writeUInt32BE(crc, 8 + dataLength);
    expect(() => decodeTeltonikaCodec8E(packet)).toThrow(/record count mismatch/);
  });

  it("writes a four-byte big-endian record acknowledgement", () => {
    expect(teltonikaRecordAcknowledgement(3).toString("hex")).toBe("00000003");
  });
});
