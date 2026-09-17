import process from "node:process"

console.log(process.argv)


import readline from 'readline';

// Enable raw mode so we can capture keypress events (like arrow keys) directly
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

const menuOptions = [
  '🚀 Run Diagnostics',
  '⚙️  View Settings',
  '📥 Download Updates',
  '❌ Exit'
];

let currentIndex = 0;

// Function to render the menu to the console
function drawMenu() {
  // Clear the screen / move cursor up based on how many lines we draw
  // For simplicity across cross-platforms, we can clear and reprint:
  console.clear();
  console.log('=== NATIVE NODE.JS CLI MENU ===');
  console.log('Use UP/DOWN arrows to move, ENTER to select.\n');
 
  menuOptions.forEach((option, index) => {
    if (index === currentIndex) {
      console.log(`> \x1b[36m${option}\x1b[0m`); // Highlight current selection in cyan
    } else {
      console.log(`  ${option}`);
    }
  });
}

// Handle keypress events
process.stdin.on('keypress', (str, key) => {
  // Allow exiting with Ctrl+C
   console.log(key)
  if (key && key.ctrl && key.name === 'c') {
    process.exit();
  }

  if (key.name === 'up') {
    currentIndex = (currentIndex - 1 + menuOptions.length) % menuOptions.length;
    drawMenu();
  } else if (key.name === 'down') {
    currentIndex = (currentIndex + 1) % menuOptions.length;
    drawMenu();
  } else if (key.name === 'return') {
    // Enter key pressed
    cleanupAndExecute(currentIndex);
  }
});

// Restore terminal settings and run the selected action
function cleanupAndExecute(index) {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  console.clear();

  const selected = menuOptions[index];
  console.log(`You selected: ${selected}
`);

  if (index === 3) {
    console.log('Goodbye! 👋');
    process.exit(0);
  } else {
    // Perform action here, or loop back to menu by re-initializing input
  }
}

// Initial draw
drawMenu();

