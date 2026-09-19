// Shared bits for the app's Claude API calls.
//
// Every call asks for JSON, so each one sends a schema through
// output_config.format: the reply is then guaranteed to parse, instead of being
// fished out of free text — where one stray sentence before the JSON used to
// throw away a request that had already been paid for.

// A schema object whose every field is required. Structured outputs require
// additionalProperties: false on every object, nested ones included.
export function objectOf(properties) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// The output_config.format value for a reply shaped like `properties`.
export function jsonSchema(properties) {
  return { type: 'json_schema', schema: objectOf(properties) };
}

// Reads a structured reply. The two cases where the schema guarantee does not
// hold — a reply cut off at max_tokens, or a declined request — are reported as
// what they are rather than surfacing as a confusing JSON parse error.
export function readStructured(data) {
  if (data?.error) throw new Error(data.error.message || 'The API returned an error.');
  if (data?.stop_reason === 'max_tokens') {
    throw new Error('The reply was cut off before it finished. Try a smaller request.');
  }
  if (data?.stop_reason === 'refusal') throw new Error('Claude declined this request.');
  const text = (data?.content || []).find(block => block.type === 'text')?.text;
  if (!text) throw new Error('No response received.');
  return JSON.parse(text);
}
