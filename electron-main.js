/**
 * Electron main process for Neon Flappy.
 * Wraps the HTML5 canvas game in a native desktop window.
 */
const { app, BrowserWindow, session } = require("electron");
const path = require("path");

// Handle Squirrel startup events on Windows (installer/uninstaller)
if (require("electron-squirrel-startup")) app.quit();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1080,
    height:          720,
    minWidth:        400,
    minHeight:       540,
    title:           "Neon Flappy",
    backgroundColor: "#0a0118",
    webPreferences: {
      preload:          path.join(__dirname, "electron-preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  // Lock to game-related navigation only
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) e.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Load the game
  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => { mainWindow = null; });
}

// Set a restrictive Content-Security-Policy
app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none';"
        ],
      },
    });
  });

  createWindow();

  app.on("activate", () => {
    // macOS: re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS keep the app running until Cmd+Q
  if (process.platform !== "darwin") app.quit();
});
