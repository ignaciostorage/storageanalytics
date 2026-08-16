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
- Reporte PDF compacto del Bloque 1.
- Modulo preparado para futura operacion y degradacion BESS.

## Alcance metodologico

Los JSON ubicados en `dashboard/data` son la fuente oficial para graficos, tablas, KPIs y reporte. El contraste con referencias operacionales del CEN constituye una verificacion de consistencia tecnico-operacional y no una validacion estricta del modelo fotovoltaico.

## Sitio

La ruta raiz abre directamente el dashboard tecnico.

https://storageanalytics.cl

## Autor

Arturo Rojas
