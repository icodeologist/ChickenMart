import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSupplier, deleteSupplier, editSupplier } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const supplierName = "Integration Supplier";
const editedSupplierName = "Integration Supplier Edited";
const keyPrefix = "supplier-integration-test";

describe("supplier creation", () => {
  beforeEach(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
    await prisma.supplier.deleteMany({ where: { name: { in: [supplierName, editedSupplierName] } } });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
    await prisma.supplier.deleteMany({ where: { name: { in: [supplierName, editedSupplierName] } } });
    await prisma.$disconnect();
  });

  it("creates once, returns duplicate retries, and rejects duplicate names", async () => {
    const first = await createSupplier({
      idempotencyKey: keyPrefix,
      name: supplierName,
    });
    const retry = await createSupplier({
      idempotencyKey: keyPrefix,
      name: supplierName,
    });

    expect(first.name).toBe(supplierName);
    expect(first.duplicate).toBe(false);
    expect(retry.id).toBe(first.id);
    expect(retry.duplicate).toBe(true);
    expect(await prisma.supplier.count({ where: { name: supplierName } })).toBe(1);

    await expect(createSupplier({
      idempotencyKey: `${keyPrefix}-different-request`,
      name: supplierName.toLowerCase(),
    })).rejects.toMatchObject({ status: 409 });
  });

  it("edits and deletes an unused supplier idempotently", async () => {
    const supplier = await createSupplier({ idempotencyKey: `${keyPrefix}-manage-create`, name: supplierName });
    const edited = await editSupplier({ idempotencyKey: `${keyPrefix}-edit`, supplierId: supplier.id, name: editedSupplierName });
    const editRetry = await editSupplier({ idempotencyKey: `${keyPrefix}-edit`, supplierId: supplier.id, name: editedSupplierName });
    expect(edited.name).toBe(editedSupplierName);
    expect(editRetry.id).toBe(supplier.id);
    expect(editRetry.duplicate).toBe(true);

    const deleted = await deleteSupplier({ idempotencyKey: `${keyPrefix}-delete`, supplierId: supplier.id });
    const deleteRetry = await deleteSupplier({ idempotencyKey: `${keyPrefix}-delete`, supplierId: supplier.id });
    expect(deleted.id).toBe(supplier.id);
    expect(deleteRetry.id).toBe(supplier.id);
    expect(await prisma.supplier.findUnique({ where: { id: supplier.id } })).toBeNull();
  });
});
