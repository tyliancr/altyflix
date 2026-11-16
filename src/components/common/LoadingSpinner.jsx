export const LoadingSpinner = () => (
    <div className="min-h-screen bg-ALTYFLIX-darker flex items-center justify-center">
        <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-ALTYFLIX-primary mx-auto mb-4"></div>
            <p className="text-ALTYFLIX-gray-300">Chargement...</p>
        </div>
    </div>
);

export default LoadingSpinner;

