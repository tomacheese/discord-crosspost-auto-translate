function doGet(e) {
  let before = e.parameter.before;
  if (before == "auto") before = "";
  let after = e.parameter.after;
  let status;
  let text;
  try {
    text = LanguageApp.translate(e.parameter.text, before, after);
    status = true;
  } catch (e) {
    text = toString(e);
    status = false;
  }
  const result = {}
  result.status = status;
  result.result = text;
  result.text = e.parameter.text;

  const response = JSON.stringify({ request: e, response: result });

  return ContentService.createTextOutput(response).setMimeType(ContentService.MimeType.JSON);
}
