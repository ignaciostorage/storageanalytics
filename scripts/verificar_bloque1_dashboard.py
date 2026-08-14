from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "dashboard" / "data"


def load_json(name: str):
    path = DATA_DIR / name
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def nums(rows, key: str) -> list[float]:
    values = []
    for row in rows:
        value = row.get(key)
        if value is None:
            continue
        number = float(value)
        if math.isfinite(number):
            values.append(number)
    return values


def main() -> None:
    json_files = sorted(DATA_DIR.glob("*.json"))
    require(json_files, "No se encontraron JSON en dashboard/data")
    for path in json_files:
        json.loads(path.read_text(encoding="utf-8"))

    tmy = load_json("recurso_solar_tmy_dashboard_bundle.json")
    nasa = load_json("recurso_solar_nasa_2025_dashboard_bundle.json")
    validation = load_json("validacion_fv_ceme1_dashboard_bundle.json")
    scada = load_json("sam_tmy_nasa_vs_cen_horario_scada_lite.json")
    architecture = load_json("ceme1_architecture.json")

    for name, bundle in [("TMY", tmy), ("NASA", nasa)]:
        profile = bundle["perfil_horario"]
        monthly = bundle["mensual"]
        require(len(profile) == 24, f"{name}: perfil horario no tiene 24 filas")
        require(len(monthly) == 12, f"{name}: mensual no tiene 12 filas")
        for key in ["ghi_promedio_wm2", "dni_promedio_wm2", "dhi_promedio_wm2"]:
            require(len(nums(profile, key)) == 24, f"{name}: {key} no tiene 24 valores numericos")
        require(len(nums(monthly, "viento_media_ms")) == 12, f"{name}: viento_media_ms no tiene 12 valores")
        for key in ["temperatura_media_c", "temperatura_max_c", "temperatura_min_c"]:
            require(len(nums(monthly, key)) == 12, f"{name}: {key} no tiene 12 valores")

    submodels = architecture["submodelos"]
    require([row["submodelo"] for row in submodels] == ["SC01", "SC02", "SC03", "SC04", "SC05", "SC06"], "Arquitectura: SC01-SC06 no estan completos/en orden")
    require(sum(row["inversores"] for row in submodels) == 120, "Arquitectura: inversores != 120")
    require(sum(row["strings"] for row in submodels) == 29424, "Arquitectura: strings != 29424")
    require(abs(sum(row["potencia_dc_mwp"] for row in submodels) - 480.1896) < 1e-6, "Arquitectura: potencia DC != 480.1896 MWdc")

    require(len(scada) == 17520, "SCADA horario: se esperaban 17520 filas para dos casos SAM")
    for case in ["SAM_TMY", "SAM_NASA_2025"]:
        rows = [row for row in scada if row.get("caso_sam") == case]
        require(len(rows) == 8760, f"{case}: no tiene 8760 filas")
        require(nums(rows, "precio_marginal_horario_usd_mwh"), f"{case}: precio marginal sin valores numericos")
        require(nums(rows, "reducciones_cen_mwh"), f"{case}: reducciones CEN sin valores numericos")

    kpis = validation["kpis"]
    require(kpis["horas_t_full"] == 8760, "T_FULL != 8760")
    require(kpis["horas_t_common_forecast"] == 8736, "T_COMMON_FORECAST != 8736")
    delta_sum = kpis["delta_1_sam_centralizado_gwh"] + kpis["delta_2_centralizado_disponible_gwh"] + kpis["delta_3_reducciones_gwh"]
    require(abs(delta_sum - kpis["residuo_total_sam_nasa_generacion_real_gwh"]) < 1e-6, "DeltaE no cierra")
    require(abs(kpis["energia_reducciones_cen_gwh"] - 259.1272) < 1e-3, "Reducciones T_FULL fuera de control")
    require(abs(kpis["reducciones_cen_common_forecast_gwh"] - 258.9866) < 1e-3, "Reducciones T_COMMON fuera de control")

    print("PASS verificar_bloque1_dashboard")
    print(f"JSON parseables: {len(json_files)}")
    print("T_FULL=8760 T_COMMON_FORECAST=8736")
    print(f"DeltaE cierre={delta_sum - kpis['residuo_total_sam_nasa_generacion_real_gwh']:.12f} GWh")


if __name__ == "__main__":
    main()
