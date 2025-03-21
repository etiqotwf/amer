function convertToSnippet(jsCode) {
    const lines = jsCode.split("\n").map(line => `      "${line.replace(/"/g, '\\"')}"`);
    return lines.join(",\n"); // إصلاح الفاصلة الزائدة
}

// ? قراءة الكود المدخل من المستخدم
const jsCode = process.argv.slice(2).join(" ");

if (!jsCode) {
    console.error("❌ الرجاء تمرير كود جافا سكريبت كمعامل!");
    process.exit(1);
}

console.log(`{
  "My Snippet": {
    "prefix": "customSnippet",
    "body": [
${convertToSnippet(jsCode)}
    ],
    "description": "Custom generated JavaScript snippet"
  }
}`);
