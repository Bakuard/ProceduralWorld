// 1. Создаем скрытый холст заданного размера
const size = 128;
const canvas = document.createElement('canvas');
canvas.width = size;
canvas.height = size;
const ctx = canvas.getContext('2d');

// 2. Вычисляем центр и радиус градиента
const centerX = size / 2;
const centerY = size / 2;
const radius = size / 2;

// Создаем радиальный градиент (от центра к краям)
const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,      // Внутренняя окружность (точка центра)
    centerX, centerY, radius  // Внешняя окружность (граница круга)
);

// 3. Настраиваем цвета и прозрачность (RGBA)
// RGB всегда белый (255, 255, 255), меняется только альфа-канал (а) от 1 до 0
//gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.8)'); // Центр: непрозрачность
//gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)'); // Край: полностью прозрачный
const steps = 32;
for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = 0.8 * (1 - t * t) ** 2;
    gradient.addColorStop(t, `rgba(255, 255, 255, ${a})`);
}

// 4. Заливаем холст созданным градиентом
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, size, size);

// 5. Экспортируем в PNG и инициируем скачивание файла
const dataURL = canvas.toDataURL('image/png');
const link = document.createElement('a');
link.download = 'point_light_texture.png';
link.href = dataURL;
link.click();