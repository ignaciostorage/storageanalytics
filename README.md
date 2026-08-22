# Storage Analytics

Dashboard tecnico de analisis de datos para el caso de estudio Planta FV + BESS.

## Caso de estudio

Planta FV + BESS.

## Funciones actuales

- Recurso solar TMY Explorador Solar y NASA POWER 2025.
- Modelacion Planta FV mediante SAM.
- Arquitectura equivalente Planta FV en seis submodelos SAM SC01-SC06.
- Comparacion operacional CEN/SEN 2025.
- Reducciones CEN y precio marginal horario Miraje 220 kV.
- Clipping FV estimado desde series DC/AC y capacidad maxima de conversion AC.
- Reporte automatico de resultados Planta FV en PDF A4.
- Modulo preparado para futura operacion y degradacion BESS.

## Flujo de datos

Los JSON ubicados en `dashboard/data` son la fuente oficial para graficos, tablas, KPIs y reporte. El contraste SAM-CEN se calcula desde las series procesadas del proyecto.

## Reporte automatico PDF

Generar el reporte y las figuras exportables:

El script de generacion de reporte del proyecto conserva su nombre interno.

Salidas:

- `output/figures/*.png`
- `output/figures/*.svg`
- `output/figures/*.pdf`
- PDF de resultados
- JSON de resultados

El boton "Abrir PDF automatico" del dashboard apunta al PDF generado.

## Sitio

La ruta raiz abre directamente el dashboard tecnico.

https://storageanalytics.cl

## Autor

Arturo Rojas
