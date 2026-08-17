# Storage Analytics

Dashboard tecnico de analisis de datos para el caso de estudio CEME1 FV + DUNE BESS.

## Caso de estudio

CEME1 FV + DUNE BESS.

## Funciones actuales

- Recurso solar TMY Explorador Solar y NASA POWER 2025.
- Modelacion FV CEME1 mediante SAM.
- Arquitectura equivalente CEME1 en seis submodelos SAM SC01-SC06.
- Comparacion operacional CEN/SEN 2025.
- Reducciones CEN y precio marginal horario Miraje 220 kV.
- Clipping FV estimado desde series DC/AC y capacidad maxima de conversion AC.
- Reporte automatico de resultados CEME1 FV en PDF A4.
- Modulo preparado para futura operacion y degradacion BESS.

## Flujo de datos

Los JSON ubicados en `dashboard/data` son la fuente oficial para graficos, tablas, KPIs y reporte. El contraste SAM-CEN se calcula desde las series procesadas del proyecto.

## Reporte automatico PDF

Generar el reporte y las figuras exportables:

```powershell
python scripts/generate_ceme1_report.py
```

Salidas:

- `output/pdf/reporte_resultados_ceme1.pdf`
- `output/figures/*.png`
- `output/figures/*.svg`
- `output/figures/*.pdf`
- `output/data/ceme1_report_results.json`

El boton "Abrir PDF automatico" del dashboard apunta al PDF generado.

## Sitio

La ruta raiz abre directamente el dashboard tecnico.

https://storageanalytics.cl

## Autor

Arturo Rojas
