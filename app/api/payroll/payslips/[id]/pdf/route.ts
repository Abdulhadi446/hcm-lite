import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { payslipForPdf } from "@/lib/services/payroll";
import { buildPayslipPdf } from "@/lib/services/payslip-pdf";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    const { payslip, companyName } = payslipForPdf(id, user);

    const pdf = await buildPayslipPdf({
      companyName,
      employeeName: payslip.employeeName,
      employeeCode: payslip.employeeCode,
      departmentName: payslip.departmentName,
      month: payslip.month,
      basic: payslip.basic,
      hra: payslip.hra,
      medical: payslip.medical,
      gross: payslip.gross,
      workingDays: payslip.workingDays,
      perDay: payslip.perDay,
      absentDays: payslip.absentDays,
      unpaidDays: payslip.unpaidDays,
      halfDays: payslip.halfDays,
      deductions: payslip.deductions,
      tax: payslip.tax,
      net: payslip.net,
    });

    const code = payslip.employeeCode.replace(/[^A-Za-z0-9_-]/g, "-");
    const buffer = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(buffer).set(pdf);
    const body = new Blob([buffer], { type: "application/pdf" });
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="payslip-${payslip.month}-${code}.pdf"`,
        "cache-control": "no-store",
        "content-length": String(pdf.byteLength),
      },
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
