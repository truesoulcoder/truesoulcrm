export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-100">
      <h1 className="text-4xl font-bold text-gray-800">404</h1>
      <p className="mt-4 text-lg text-gray-600">Page not found</p>
      <a 
        href="/" 
        className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Return Home
      </a>
    </div>
  );
}