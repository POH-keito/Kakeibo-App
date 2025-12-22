# IME Support Request Snippet

## Introduction

This is a typical issue that commonly occurs in regions using IME (Input Method Editors)
for Japanese, Chinese, Korean, and other languages. Here are the main implementation solutions:

a. **IME State Detection and Control**

```javascript
// Detect if IME is currently in use
element.addEventListener("compositionstart", () => {
  isComposing = true;
});

element.addEventListener("compositionend", () => {
  isComposing = false;
});

// Disable shortcuts during IME input on key events
document.addEventListener("keydown", (e) => {
  if (isComposing && (e.key === "Tab" || e.key === "Enter")) {
    return; // Don't execute shortcuts
  }
});
```

b. **Configuration-based Disable Options**

- Users can individually toggle shortcut keys ON/OFF
- Auto-detection based on locale settings (disable specific keys in Japanese environments)

c. **Alternative Shortcut Keys**

- Change to key combinations that don't conflict with IME, like `Ctrl+Enter` or `Cmd+Enter`
- User-customizable shortcut settings

d. **Priority-based Control**

```javascript
// Prioritize IME input, check shortcuts after completion
if (event.isComposing || event.keyCode === 229) {
  return; // Prioritize IME processing
}
```

## **Most Practical Solution**

The combination of **IME detection + configuration options** is most effective.
It's technically reliable and accommodates user preferences.
Many web applications (VS Code, Notion, Slack, etc.) use similar implementations.

