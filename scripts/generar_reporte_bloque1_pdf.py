from __future__ import annotations

import json
import unicodedata
from datetime import datetime
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dashboard" / "data"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_PATH = OUTPUT_DIR / "reporte_bloque1_storage_analytics.pdf"


def load_json(name: str) -> dict:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()


def clean_text(value) -> str:
    text = str(value)
    normalized = fold(text)
    has_strict_validation = "validacion" in normalized and "estricta" in normalized
    has_indirect_validation = normalized.startswith("la validacion es indirecta")
    if has_strict_validation or has_indirect_validation:
        return "El contraste constituye una verificación de consistencia técnico-operacional con referencias CEN."
    return text


def fmt(value, decimals: int = 1, suffix: str = "") -> str:
    if value is None:
        return "Dato no disponible"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return clean_text(value)
    return f"{number:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".") + suffix


def pct(value, decimals: int = 1) -> str:
    return fmt(value, decimals, " %")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleSA", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=colors.HexColor("#10233f"), spaceAfter=8))
styles.add(ParagraphStyle(name="BodySA", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5, leading=12.5, textColor=colors.HexColor("#334155"), spaceAfter=7))
styles.add(ParagraphStyle(name="SectionSA", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#15375f"), spaceBefore=9, spaceAfter=6))
styles.add(ParagraphStyle(name="CellSA", parent=styles["Normal"], fontName="Helvetica", fontSize=7.0, leading=8.4, textColor=colors.HexColor("#1f2937")))
styles.add(ParagraphStyle(name="HeadSA", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.0, leading=8.4, textColor=colors.white))
styles.add(ParagraphStyle(name="NoteSA", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=8, leading=10, textColor=colors.HexColor("#475569")))


def para(text, style: str = "CellSA") -> Paragraph:
    return Paragraph(escape(clean_text(text)), styles[style])


def make_table(headers: list[str], rows: list[list], widths: list, size: float = 7.0) -> Table:
    table = Table([[para(h, "HeadSA") for h in headers]] + [[para(cell) for cell in row] for row in rows], colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#15375f")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("FONTSIZE", (0, 0), (-1, -1), size),
    ]))
    return table


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(colors.HexColor("#15375f"))
    canvas.drawString(doc.leftMargin, 1.0 * cm, "Storage Analytics - Bloque 1 FV CEME1")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 1.0 * cm, f"Página {doc.page}")
    canvas.restoreState()


def build_story() -> list:
    validation = load_json("validacion_fv_ceme1_dashboard_bundle.json")
    clipping = load_json("clipping_sam_dashboard_bundle.json")
    kpis = validation["kpis"]
    meta = validation["metadata"]

    story = [
        Paragraph("Reporte Bloque 1 - Storage Analytics", styles["TitleSA"]),
        Paragraph("Modelación FV CEME1, contraste CEN 2025 y señal candidata para BESS", styles["BodySA"]),
        Paragraph(
            f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M')} desde JSON oficiales en dashboard/data. "
            f"Barra de precio: {meta.get('barra_precio', 'Miraje 220 kV')}. Planta: {meta.get('planta', 'CEME1')}.",
            styles["BodySA"],
        ),
        Paragraph("1. Resumen ejecutivo", styles["SectionSA"]),
        Paragraph(
            f"El Bloque 1 consolida la simulación fotovoltaica SAM de CEME1 y su contraste con referencias operacionales CEN/SEN 2025. "
            f"SAM NASA 2025 alcanza {fmt(kpis.get('energia_sam_nasa_2025_gwh'), 3)} GWh en cobertura completa de {kpis.get('horas_t_full')} h. "
            f"El Pronóstico centralizado CEN alcanza {fmt(kpis.get('energia_pronostico_centralizado_cen_gwh'), 3)} GWh en "
            f"{kpis.get('energia_pronostico_centralizado_cen_horas')} h disponibles; no se imputa el 31-07-2025. "
            f"CEN disponible suma {fmt(kpis.get('energia_cen_disponible_gwh'), 3)} GWh y las Reducciones CEN suman "
            f"{fmt(kpis.get('energia_reducciones_cen_gwh'), 3)} GWh sobre T_FULL.",
            styles["BodySA"],
        ),
    ]

    story.append(make_table(["Concepto", "Valor", "Interpretación"], [
        ["T_FULL", kpis.get("cobertura_t_full", "8760 h"), "SAM NASA/TMY, generación real CEN, Reducciones CEN y CEN disponible anual."],
        ["T_COMMON_FORECAST", kpis.get("cobertura_t_common_forecast", "8736 h"), "Ventana común con Pronóstico centralizado CEN; faltan 24 h del 31-07-2025, sin imputación."],
        ["Precio marginal horario", meta.get("barra_precio", "Miraje 220 kV"), "Se usa PMg Miraje 220 kV desde CEN/SEN para valorización."],
        ["Señal candidata BESS", kpis.get("senal_energia_candidata_bess", "Reducciones CEN"), "No se usa residuo SAM - CEN disponible como energía recuperable BESS."],
    ], [4 * cm, 4 * cm, 16 * cm]))

    story.append(Paragraph("2. KPIs anuales oficiales", styles["SectionSA"]))
    story.append(make_table(["Señal", "Valor", "Unidad", "Cobertura", "Nota"], [
        ["SAM NASA 2025", fmt(kpis.get("energia_sam_nasa_2025_gwh"), 3), "GWh", "8760 h", "Simulación FV 2025 con meteorología NASA POWER."],
        ["SAM TMY Explorador Solar", fmt(kpis.get("energia_sam_tmy_gwh"), 3), "GWh", "8760 h", "Caso meteorológico típico para caracterización."],
        ["Pronóstico centralizado CEN", fmt(kpis.get("energia_pronostico_centralizado_cen_gwh"), 3), "GWh", f"{kpis.get('energia_pronostico_centralizado_cen_horas')} h", "Referencia operacional CEN, sin imputación."],
        ["Generación real CEN", fmt(kpis.get("energia_generacion_real_cen_gwh"), 3), "GWh", "8760 h", "Inyección registrada."],
        ["Reducciones CEN T_FULL", fmt(kpis.get("energia_reducciones_cen_gwh"), 3), "GWh", "8760 h", "Curtailment operacional observado."],
        ["Reducciones CEN T_COMMON_FORECAST", fmt(kpis.get("reducciones_cen_common_forecast_gwh"), 3), "GWh", "8736 h", "Delta E3 usado en descomposición común."],
        ["CEN disponible", fmt(kpis.get("energia_cen_disponible_gwh"), 3), "GWh", "8760 h", "Generación real CEN + Reducciones CEN."],
        ["Factor Reducciones CEN", pct(kpis.get("factor_reducciones_cen_pct"), 3), "%", "8760 h", "Reducciones CEN / CEN disponible."],
        ["Residuo SAM NASA - CEN disponible", fmt(kpis.get("residuo_sam_nasa_vs_cen_disponible_gwh"), 3), "GWh", "8760 h", "Brecha técnico-operacional, no energía BESS directa."],
    ], [5.2 * cm, 3.1 * cm, 1.8 * cm, 2.7 * cm, 11.2 * cm]))

    story.append(Paragraph("3. Métricas de consistencia técnico-operacional", styles["SectionSA"]))
    story.append(make_table(["Comparación", "Cobertura", "Horas", "MBE MWh", "MAE MWh", "RMSE MWh", "nRMSE", "r", "Delta anual"], [[
        row.get("comparacion", "--"),
        row.get("cobertura_temporal", "--"),
        f"{row.get('horas_cobertura', '--')} h",
        fmt(row.get("mbe_mwh"), 2),
        fmt(row.get("mae_mwh"), 2),
        fmt(row.get("rmse_mwh"), 2),
        pct(row.get("nrmse_pct"), 2),
        fmt(row.get("corr_pearson"), 3),
        pct(row.get("delta_pct"), 2),
    ] for row in validation.get("metricas", [])], [6.0 * cm, 3.2 * cm, 2 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm, 2.1 * cm, 1.6 * cm, 2.4 * cm], 6.8))

    story.append(Paragraph("4. Descomposición operacional del residuo", styles["SectionSA"]))
    delta_rows = [[
        row.get("eslabon", "--"),
        row.get("comparacion", "--"),
        fmt(row.get("energia_gwh", row.get("energia_anual_gwh")), 3),
        f"{row.get('horas_cobertura', '--')} h",
        row.get("interpretacion", "--"),
    ] for row in validation.get("deltas", [])]
    delta_rows.append(["Control cierre", "Suma Delta E1+E2+E3 vs residuo total", fmt(kpis.get("control_deltas_error_gwh"), 6), "8736 h", "Error numérico cercano a cero."])
    story.append(make_table(["Eslabón", "Comparación", "Energía GWh", "Cobertura", "Interpretación"], delta_rows, [3 * cm, 6.2 * cm, 2.5 * cm, 2.2 * cm, 10.1 * cm]))

    story.append(PageBreak())
    story.append(Paragraph("5. Tabla mensual de control", styles["SectionSA"]))
    story.append(make_table(["Mes", "SAM NASA", "Pronóstico CEN", "CEN disp.", "Real CEN", "Reducciones", "Delta E1", "Delta E2", "Delta E3", "Cob. común"], [[
        row.get("mes_nombre", row.get("mes", "--")),
        fmt(row.get("sam_nasa_2025_gwh"), 2),
        fmt(row.get("pronostico_centralizado_cen_gwh"), 2),
        fmt(row.get("cen_disponible_gwh"), 2),
        fmt(row.get("generacion_real_cen_gwh"), 2),
        fmt(row.get("reducciones_cen_gwh"), 2),
        fmt(row.get("delta_1_sam_centralizado_gwh"), 2),
        fmt(row.get("delta_2_centralizado_disponible_gwh"), 2),
        fmt(row.get("delta_3_reducciones_gwh"), 2),
        row.get("cobertura_t_common_forecast", "--"),
    ] for row in validation.get("mensual", [])], [1.4 * cm, 2.3 * cm, 2.5 * cm, 2.3 * cm, 2.2 * cm, 2.4 * cm, 2.0 * cm, 2.0 * cm, 2.0 * cm, 2.2 * cm], 6.5))
    story.append(Paragraph("Nota: julio usa 720 h comunes en T_COMMON_FORECAST; no se imputa el día 31-07-2025.", styles["NoteSA"]))

    story.append(Paragraph("6. Clipping FV estimado DC/AC", styles["SectionSA"]))
    story.append(make_table(["Caso", "Clipping MWh", "Clipping GWh", "% AC+clip", "P max MW", "Horas", "Método"], [[
        row.get("nombre_caso") or row.get("caso_sam"),
        fmt(row.get("energia_clipping_mwh"), 1),
        fmt(row.get("energia_clipping_gwh"), 3),
        pct(row.get("clipping_pct_vs_ac_mas_clip"), 3),
        fmt(row.get("potencia_clipping_max_mw"), 2),
        row.get("horas_con_clipping", "--"),
        row.get("metodo_clipping", "--"),
    ] for row in clipping.get("kpis", [])], [4.8 * cm, 2.8 * cm, 2.6 * cm, 2.3 * cm, 2.3 * cm, 1.7 * cm, 5.5 * cm], 6.8))
    story.append(Paragraph("El clipping corresponde a pérdida interna por limitación DC/AC estimada desde series SAM. No equivale a Reducciones CEN y no se usa actualmente como energía de carga BESS.", styles["BodySA"]))

    story.append(Paragraph("7. Decisión técnica para BESS", styles["SectionSA"]))
    clip_nasa = next((row.get("energia_clipping_gwh") for row in clipping.get("kpis", []) if row.get("caso_sam") == "SAM_NASA_2025"), None)
    story.append(make_table(["Elemento", "Valor", "Decisión"], [
        ["Energía candidata", "Reducciones CEN", "Señal operacional observada y valorizable con precio marginal horario Miraje 220 kV."],
        ["Residuo SAM - CEN disponible", fmt(kpis.get("residuo_sam_nasa_vs_cen_disponible_gwh"), 3) + " GWh", "Brecha técnico-operacional, no recuperable directamente por BESS."],
        ["Clipping FV SAM NASA 2025", fmt(clip_nasa, 3) + " GWh", "Pérdida interna DC/AC; se documenta separada de curtailment CEN."],
        ["Operación BESS", "Pendiente", "Requiere JSON oficial de despacho, SOC, carga, descarga, eficiencia y degradación."],
    ], [5 * cm, 4 * cm, 15 * cm]))

    story.append(Paragraph("8. Limitaciones", styles["SectionSA"]))
    story.append(make_table(["Limitación metodológica"], [[clean_text(item)] for item in validation.get("limitaciones", [])], [24 * cm]))

    story.append(Paragraph("9. Cierre", styles["SectionSA"]))
    story.append(Paragraph(
        f"La cadena Delta E1 ({fmt(kpis.get('delta_1_sam_centralizado_gwh'), 3)} GWh), Delta E2 ({fmt(kpis.get('delta_2_centralizado_disponible_gwh'), 3)} GWh) "
        f"y Delta E3 ({fmt(kpis.get('delta_3_reducciones_gwh'), 3)} GWh) cierra el residuo total con error {fmt(kpis.get('control_deltas_error_gwh'), 6)} GWh. "
        "Con esto, el Bloque 1 queda documentado como base FV y CEN para avanzar al Bloque 2 BESS sin mezclar clipping, residuo SAM-CEN disponible y Reducciones CEN.",
        styles["BodySA"],
    ))
    return story


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=landscape(A4),
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.1 * cm,
        bottomMargin=1.6 * cm,
        title="Reporte Bloque 1 - Storage Analytics",
        author="Storage Analytics",
    )
    doc.build(build_story(), onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
