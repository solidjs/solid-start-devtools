import type { SerovalNode } from 'seroval';

// Readers of the JSON nodes of a seroval stream, shared by the body viewer and
// the reports.

export function getNodeType(node: SerovalNode) {
  switch (node.t) {
    // Number = 0,
    case 0:
      return 'number';
    // String = 1,
    case 1:
      return 'string';
    // Constant = 2,
    case 2:
      switch (node.s) {
        case 0:
          return 'null';
        case 1:
          return 'undefined';
        case 2:
          return 'true';
        case 3:
          return 'false';
        case 4:
          return '-0';
        case 5:
          return 'Infinity';
        case 6:
          return '-Infinity';
        case 7:
          return 'NaN';
      }
      break;
    // BigInt = 3,
    case 3:
      return 'bigint';
    // Date = 5,
    case 5:
      return 'Date';
    // RegExp = 6,
    case 6:
      return 'RegExp';
    // Set = 7,
    case 7:
      return 'Set';
    // Map = 8,
    case 8:
      return 'Map';
    // Array = 9,
    case 9:
      return 'Array';
    // Object = 10,
    case 10:
    // NullConstructor = 11,
    case 11:
      return 'Object';
    // Promise = 12,
    case 12:
      return 'Promise';
    // Error = 13,
    case 13:
      switch (node.s) {
        case 0:
          return 'Error';
        case 1:
          return 'EvalError';
        case 2:
          return 'RangeError';
        case 3:
          return 'ReferenceError';
        case 4:
          return 'SyntaxError';
        case 5:
          return 'TypeError';
        case 6:
          return 'URIError';
      }
      return 'Error';
    // AggregateError = 14,
    case 14:
      return 'AggregateError';
    // TypedArray = 15,
    case 15:
    // BigIntTypedArray = 16,
    case 16:
      return node.c;
    // WKSymbol = 17,
    case 17:
      return 'symbol';
    // ArrayBuffer = 19,
    case 19:
      return 'ArrayBuffer';
    // DataView = 20,
    case 20:
      return 'DataView';
    // Boxed = 21,
    case 21:
      return 'Boxed';
    // PromiseConstructor = 22,
    case 22:
      return 'Promise';
    // Plugin = 25,
    case 25:
      return 'Plugin';
    // IteratorFactoryInstance = 28,
    case 28:
      return 'Iterator';
    // AsyncIteratorFactoryInstance = 30,
    case 30:
      return 'AsyncIterator';
    // StreamConstructor = 31,
    case 31:
      return 'Stream';
    case 35:
      return 'Sequence';
  }
  return 'unknown';
}

export function traverse(node: SerovalNode, handler: (node: SerovalNode) => void): void {
  handler(node);
  switch (node.t) {
    // Number = 0,
    case 0:
    // String = 1,
    case 1:
    // Constant = 2,
    case 2:
    // BigInt = 3,
    case 3:
    // IndexedValue = 4,
    case 4:
    // Date = 5,
    case 5:
    // RegExp = 6,
    case 6:
      break;
    // Set = 7,
    case 7:
      for (const child of node.a) {
        traverse(child, handler);
      }
      break;
    // Map = 8,
    case 8:
      for (const key of node.e.k) {
        traverse(key, handler);
      }
      for (const value of node.e.v) {
        traverse(value, handler);
      }
      break;
    // Array = 9,
    case 9:
      for (const child of node.a) {
        if (child) {
          traverse(child, handler);
        }
      }
      break;
    // Object = 10,
    case 10:
    // NullConstructor = 11,
    case 11:
      for (const child of node.p.k) {
        if (typeof child !== 'string') {
          traverse(child, handler);
        }
      }
      for (const child of node.p.v) {
        traverse(child, handler);
      }
      break;
    // Promise = 12,
    case 12:
      traverse(node.f, handler);
      break;
    // Error = 13,
    case 13:
    // AggregateError = 14,
    case 14:
      if (node.p) {
        for (const child of node.p.k) {
          if (typeof child !== 'string') {
            traverse(child, handler);
          }
        }
        for (const child of node.p.v) {
          traverse(child, handler);
        }
      }
      break;
    // TypedArray = 15,
    case 15:
    // BigIntTypedArray = 16,
    case 16:
      traverse(node.f, handler);
      break;
    // WKSymbol = 17,
    case 17:
    // Reference = 18,
    case 18:
      break;
    // ArrayBuffer = 19,
    case 19:
    // DataView = 20,
    case 20:
    // Boxed = 21,
    case 21:
      traverse(node.f, handler);
      break;
    // PromiseConstructor = 22,
    case 22:
      break;
    // PromiseSuccess = 23,
    case 23:
    // PromiseFailure = 24,
    case 24:
      traverse(node.a[1], handler);
      break;
    // Plugin = 25,
    case 25:
      for (const key in node.s) {
        const current = node.s[key];
        if (current) {
          traverse(current, handler);
        }
      }
      break;
    // SpecialReference = 26,
    case 26:
      break;
    // IteratorFactory = 27,
    case 27:
      traverse(node.f, handler);
      break;
    // IteratorFactoryInstance = 28,
    case 28:
      traverse(node.a[0], handler);
      traverse(node.a[1], handler);
      break;
    // AsyncIteratorFactory = 29,
    case 29:
      traverse(node.a[1], handler);
      break;
    // AsyncIteratorFactoryInstance = 30,
    case 30:
      traverse(node.a[0], handler);
      traverse(node.a[1], handler);
      break;
    // StreamConstructor = 31,
    case 31:
      for (const child of node.a) {
        traverse(child, handler);
      }
      break;
    // StreamNext = 32,
    case 32:
    // StreamThrow = 33,
    case 33:
    // StreamReturn = 34
    case 34:
      traverse(node.f, handler);
      break;
    case 35:
      for (const child of node.a) {
        if (child) {
          traverse(child, handler);
        }
      }
      break;
  }
}

export function getConstantValue(value: number) {
  switch (value) {
    case 0:
      return 'null';
    case 1:
      return 'undefined';
    case 2:
      return 'true';
    case 3:
      return 'false';
    case 4:
      return '-0';
    case 5:
      return 'Infinity';
    case 6:
      return '-Infinity';
    case 7:
      return 'NaN';
  }
  return '';
}

export function getSymbolValue(value: number) {
  switch (value) {
    case 0:
      return 'Symbol.asyncIterator';
    case 1:
      return 'Symbol.hasInstance';
    case 2:
      return 'Symbol.isConcatSpreadable';
    case 3:
      return 'Symbol.iterator';
    case 4:
      return 'Symbol.match';
    case 5:
      return 'Symbol.matchAll';
    case 6:
      return 'Symbol.replace';
    case 7:
      return 'Symbol.search';
    case 8:
      return 'Symbol.species';
    case 9:
      return 'Symbol.toPrimitive';
    case 10:
      return 'Symbol.toStringTag';
    case 11:
      return 'Symbol.unscopables';
  }
  return '';
}
