export type StageInput = { 
  projectDescription: string; 
  prior?: Record<string, any> 
};

export const prompt = (input: StageInput): string => {
  const priorContext = input.prior ? `\n\nPrevious design context:\n${JSON.stringify(input.prior, null, 2)}` : '';
  
  return `You are a firmware/software generation assistant. Based on the chosen microcontroller and hardware, write functional code.

=== PROJECT DESCRIPTION ===
${input.projectDescription}${priorContext}

=== TASKS ===
1. Specify target platform (e.g., Arduino Uno, STM32F4, ESP32-WROOM).

2. Generate firmware source code with:
   - Initialization and pinMode setup
   - Main loop logic
   - Actuator control
   - Sensor reading
   - Communication routines if needed (I²C, SPI, UART, CAN)
   - Clear inline comments

3. State exact dependencies:
   - Libraries (name, version, import statement)
   - Toolchain (Arduino IDE, PlatformIO, ESP-IDF)
   - Upload method (USB, SWD, OTA)

4. If multiple firmwares are needed (e.g., motor driver + main controller), generate separate files.

5. If higher-level software (PC interface, mobile app) is expected, generate skeleton code in Python/JS with comments on purpose.

6. Handle Edge Cases:
   - If hardware is ambiguous, generate generic template code and mark placeholders (e.g., "PIN_X").
   - If functionality is unsafe (e.g., high-power lasers, mains voltages), write pseudocode and flag: "SAFETY CRITICAL – do not run without professional oversight."

=== OUTPUT FORMAT ===
Provide complete firmware implementation with:
- Well-formatted code blocks with language specified
- Setup instructions
- Library dependencies
- Upload/deployment instructions

Then include JSON metadata:

\`\`\`json
{
  "target": "ESP32-WROOM-32",
  "language": "C++",
  "framework": "Arduino",
  "libraries": [
    {"name": "Wire", "version": "built-in", "purpose": "I2C communication"},
    {"name": "Adafruit_BME280", "version": "2.2.2", "purpose": "Temperature/humidity sensor"},
    {"name": "WiFi", "version": "built-in", "purpose": "Network connectivity"}
  ],
  "toolchain": "Arduino IDE 2.x or PlatformIO",
  "upload_method": "USB serial (CP2102)",
  "code_files": [
    {"filename": "main.cpp", "purpose": "Main firmware"},
    {"filename": "config.h", "purpose": "Configuration constants"}
  ],
  "pin_assignments": {
    "I2C_SDA": 21,
    "I2C_SCL": 22,
    "LED_STATUS": 2,
    "BUTTON_INPUT": 34
  },
  "safety_flags": [],
  "testing_notes": "Test I2C communication first, then WiFi connectivity",
  "estimated_flash_usage": "450KB",
  "estimated_ram_usage": "32KB"
}
\`\`\``;
};