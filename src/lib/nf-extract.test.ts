import { describe, it, expect } from "vitest";
import { parseExtractedNf, mergeExtractedNf } from "./nf-extract.functions";

describe("parseExtractedNf", () => {
  it("parses clean JSON from a PDF-style response", () => {
    const raw = '{"nf_numero": "123456", "tutor_cpf": "123.456.789-00"}';
    expect(parseExtractedNf(raw)).toEqual({
      nf_numero: "123456",
      tutor_cpf: "123.456.789-00",
    });
  });

  it("parses JSON wrapped in markdown fences (image-style response)", () => {
    const raw = "```json\n{\"nf_numero\":\"789\",\"tutor_cpf\":\"111.222.333-44\"}\n```";
    expect(parseExtractedNf(raw)).toEqual({
      nf_numero: "789",
      tutor_cpf: "111.222.333-44",
    });
  });

  it("extracts JSON embedded in prose text", () => {
    const raw = 'Segue o resultado: {"nf_numero":"42","tutor_cpf":null} — fim.';
    expect(parseExtractedNf(raw)).toEqual({
      nf_numero: "42",
      tutor_cpf: null,
    });
  });

  it("returns null for missing or empty fields", () => {
    const raw = '{"nf_numero": "", "tutor_cpf": null}';
    expect(parseExtractedNf(raw)).toEqual({ nf_numero: null, tutor_cpf: null });
  });

  it("rejects CPF in wrong format (e.g. only digits or CNPJ)", () => {
    const raw = '{"nf_numero":"1","tutor_cpf":"12345678900"}';
    expect(parseExtractedNf(raw).tutor_cpf).toBeNull();
    const cnpj = '{"nf_numero":"1","tutor_cpf":"12.345.678/0001-90"}';
    expect(parseExtractedNf(cnpj).tutor_cpf).toBeNull();
  });

  it("coerces numeric nf_numero to string", () => {
    const raw = '{"nf_numero": 987, "tutor_cpf": "999.888.777-66"}';
    expect(parseExtractedNf(raw).nf_numero).toBe("987");
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseExtractedNf("resposta sem JSON aqui")).toThrow();
  });
});

describe("mergeExtractedNf", () => {
  it("fills both fields when current is empty", () => {
    const current = { nf_numero: null, tutor_cpf: null };
    const extracted = { nf_numero: "100", tutor_cpf: "111.222.333-44" };
    expect(mergeExtractedNf(current, extracted)).toEqual({
      nf_numero: "100",
      tutor_cpf: "111.222.333-44",
    });
  });

  it("preserves existing nf_numero and only fills empty tutor_cpf", () => {
    const current = { nf_numero: "EXISTENTE", tutor_cpf: null };
    const extracted = { nf_numero: "NOVO", tutor_cpf: "111.222.333-44" };
    expect(mergeExtractedNf(current, extracted)).toEqual({
      tutor_cpf: "111.222.333-44",
    });
  });

  it("preserves existing tutor_cpf and only fills empty nf_numero", () => {
    const current = { nf_numero: null, tutor_cpf: "000.000.000-00" };
    const extracted = { nf_numero: "500", tutor_cpf: "111.222.333-44" };
    expect(mergeExtractedNf(current, extracted)).toEqual({ nf_numero: "500" });
  });

  it("returns empty update when both fields already exist", () => {
    const current = { nf_numero: "A", tutor_cpf: "111.222.333-44" };
    const extracted = { nf_numero: "B", tutor_cpf: "999.999.999-99" };
    expect(mergeExtractedNf(current, extracted)).toEqual({});
  });

  it("returns empty update when extraction found nothing", () => {
    const current = { nf_numero: null, tutor_cpf: null };
    const extracted = { nf_numero: null, tutor_cpf: null };
    expect(mergeExtractedNf(current, extracted)).toEqual({});
  });

  it("does not overwrite empty-string fields with extracted values (treats '' as empty)", () => {
    const current = { nf_numero: "", tutor_cpf: "" };
    const extracted = { nf_numero: "77", tutor_cpf: "123.456.789-00" };
    expect(mergeExtractedNf(current, extracted)).toEqual({
      nf_numero: "77",
      tutor_cpf: "123.456.789-00",
    });
  });
});
